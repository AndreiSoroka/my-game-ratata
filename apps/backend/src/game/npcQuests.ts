import {
    type GameEventPayload,
    type NpcQuestClientMessage,
    type NpcQuestDecision,
    type NpcQuestSocialSnapshot,
    type QuestDraft,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { answerQuestOffer } from './npcQuestAcceptance'
import { NpcQuestLifecycle } from './npcQuestLifecycle'
import { createQuestOffer, createWorkerQuestOffer } from './npcQuestOffers'
import { inspectQuest, observeQuestDeath } from './npcQuestProgress'
import { settleNpcQuest } from './npcQuestSettlement'
import { snapshotNpcQuests } from './npcQuestSnapshots'
import {
    type NpcQuestEnvironment,
    type NpcQuestRecord,
    questContact,
    type QuestOfferRecord,
} from './npcQuestTypes'
import {
    type AssetWallet,
    availableGold,
    availableInventoryQuantity,
    RewardReservations,
} from './rewardReservations'

export interface NpcQuestResult {
    accepted: boolean
    error: string | null
    events: GameEventPayload[]
}

/** Model prose proposes; only validated commands and resolved events change a contract. */
export class NpcQuestService {
    private readonly offers = new Map<string, QuestOfferRecord>()
    private readonly jobs = new Map<string, NpcQuestRecord>()
    private readonly reservations = new RewardReservations()
    private readonly funds = new Map<string, AssetWallet>(
        WORLD_LOCATION_DEFINITIONS.filter(
            (location) => location.biome === 'city'
        ).map((location) => [
            location.id,
            { gold: location.municipalQuestGold ?? 300 },
        ])
    )
    private nextId = 1

    private readonly lifecycle: NpcQuestLifecycle
    public constructor(private readonly environment: NpcQuestEnvironment) {
        this.lifecycle = new NpcQuestLifecycle(environment, this.reservations)
    }

    public readonly decide = (
        issuer: GameCharacter,
        decision: NpcQuestDecision,
        now: number
    ) => this.handleDecision(issuer, decision, now)

    public stop(): void {
        for (const job of this.jobs.values()) {
            this.lifecycle.cancel(job, 'Мир остановлен. Договор отменён.')
        }
        this.offers.clear()
    }

    public handleDecision(
        issuer: GameCharacter,
        decision: NpcQuestDecision,
        now: number
    ): NpcQuestResult {
        return decision.type === 'quest_propose'
            ? this.propose(issuer, decision.targetId, decision.draft, now)
            : this.workerPropose(
                  issuer,
                  decision.targetId,
                  decision.requestId,
                  now
              )
    }

    public propose(
        issuer: GameCharacter,
        targetId: string,
        draft: QuestDraft,
        now: number
    ): NpcQuestResult {
        const offer = createQuestOffer(
            issuer,
            targetId,
            draft,
            this.environment,
            this.newId('offer'),
            now
        )
        if (typeof offer === 'string') {
            return this.result(false, offer)
        }
        const wallet = this.rewardWallet(offer, issuer)
        if (
            wallet === undefined ||
            availableGold(wallet) < draft.rewardGold ||
            draft.rewardItems.some(
                (item) =>
                    availableInventoryQuantity(
                        issuer.inventory,
                        item.instanceId
                    ) < item.quantity
            )
        ) {
            return this.result(
                false,
                'У меня сейчас нет свободной награды для такого обещания.'
            )
        }
        this.offers.set(targetId, offer)
        return this.result(true)
    }

    public workerPropose(
        issuer: GameCharacter,
        targetId: string,
        requestId: string,
        now: number
    ): NpcQuestResult {
        const offer = createWorkerQuestOffer(
            issuer,
            targetId,
            requestId,
            this.environment,
            this.newId('worker-offer'),
            now
        )
        if (typeof offer === 'string') {
            return this.result(false, offer)
        }
        this.offers.set(targetId, offer)
        return this.result(true)
    }

    public handle(
        actor: GameCharacter,
        message: NpcQuestClientMessage,
        now: number
    ): NpcQuestResult {
        if (message.type === 'quest_offer_answer') {
            return answerQuestOffer(
                {
                    environment: this.environment,
                    offers: this.offers,
                    jobs: this.jobs,
                    reservations: this.reservations,
                    rewardWallet: (offer, issuer) =>
                        this.rewardWallet(offer, issuer),
                    newId: (prefix) => this.newId(prefix),
                    cancel: (job, notice) => this.lifecycle.cancel(job, notice),
                    refresh: (job) => this.lifecycle.refresh(job),
                },
                actor,
                message,
                now
            )
        }
        const job = this.jobs.get(message.instanceId)
        const group = this.environment.parties.contractGroup(actor.id)
        if (group.leaderId !== actor.id) {
            return this.result(false, 'Договор принимает и сдаёт лидер группы.')
        }
        if (
            job === undefined ||
            (this.environment.parties.contractSlots.get(group.key) !==
                message.instanceId &&
                !terminalReceiptOwner(job, actor.id))
        ) {
            return this.result(false, 'Этот договор вам недоступен.')
        }
        if (message.type === 'npc_quest_abandon') {
            this.lifecycle.cancel(job, 'Договор оставлен. Награда освобождена.')
            return this.result(true)
        }
        return this.turnIn(actor, job, now)
    }

    public snapshot(actorId: string, now = Date.now()): NpcQuestSocialSnapshot {
        return snapshotNpcQuests(actorId, now, {
            environment: this.environment,
            offers: this.offers,
            jobs: this.jobs,
        })
    }

    public update(now: number): void {
        for (const [id, offer] of this.offers) {
            const issuer = this.environment.getCharacter(offer.view.issuerId)
            if (
                offer.view.expiresAt <= now ||
                issuer?.alive !== true ||
                issuer.deathSequence !== offer.issuerDeath
            ) {
                this.offers.delete(id)
            }
        }
        for (const job of this.jobs.values()) {
            this.lifecycle.refresh(job)
        }
    }

    public observe(events: GameEventPayload[]): void {
        for (const event of events) {
            for (const job of this.jobs.values()) {
                if (
                    event.kind === 'death' &&
                    event.targetId === job.view.issuerId
                ) {
                    this.lifecycle.cancel(
                        job,
                        'Заказчик погиб. Договор отменён; резерв освобождён.'
                    )
                }
                observeQuestDeath(job, event, this.environment)
            }
        }
    }

    public inspect(actorId: string, targetId: string, receiptId: string): void {
        for (const job of this.jobs.values()) {
            inspectQuest(job, actorId, targetId, receiptId, this.environment)
        }
    }

    public cityFund(cityId: string): number {
        const wallet = this.funds.get(cityId)
        return wallet === undefined ? 0 : availableGold(wallet)
    }

    public conversation(issuerId: string, recipientId: string) {
        return [...this.jobs.values()]
            .filter(
                (job) =>
                    job.view.issuerId === issuerId &&
                    job.acceptedBy === recipientId
            )
            .map((job) => structuredClone(job.view))
    }

    private turnIn(
        actor: GameCharacter,
        job: NpcQuestRecord,
        now: number
    ): NpcQuestResult {
        if (job.view.status === 'completed') {
            return this.result(true)
        }
        this.lifecycle.refresh(job)
        const issuer = this.environment.getCharacter(job.view.issuerId)
        if (
            job.view.status !== 'ready' ||
            !questContact(actor, issuer, this.environment, now)
        ) {
            return this.result(
                false,
                job.view.notice ??
                    'Условия ещё не выполнены или заказчик далеко.'
            )
        }
        const wallet = this.rewardWallet({ view: job.view }, issuer)
        const shares =
            wallet === undefined
                ? undefined
                : settleNpcQuest(
                      job,
                      actor,
                      issuer,
                      wallet,
                      this.environment,
                      now
                  )
        if (shares === undefined) {
            return this.result(
                false,
                'Передача не состоялась: проверьте вещи, вместимость и награду.'
            )
        }
        job.view.status = 'completed'
        job.submittedBy = actor.id
        job.view.rewardShares = shares
        job.view.receiptId = job.view.instanceId
        job.view.notice = 'Договор выполнен. Имущество и награда переданы.'
        this.lifecycle.release(job)
        return this.result(true)
    }

    private rewardWallet(
        offer: Pick<QuestOfferRecord, 'view'>,
        issuer: GameCharacter
    ): AssetWallet | undefined {
        return offer.view.funding === 'city'
            ? this.funds.get(offer.view.fundingCityId ?? issuer.locationId)
            : this.environment.adventure.walletFor(issuer.id)
    }

    private newId(prefix: string): string {
        return `npc-${prefix}-${String(this.nextId++)}`
    }
    private result(
        accepted: boolean,
        error: string | null = null
    ): NpcQuestResult {
        return { accepted, error, events: [] }
    }
}

function terminalReceiptOwner(job: NpcQuestRecord, actorId: string): boolean {
    return (
        ['completed', 'cancelled'].includes(job.view.status) &&
        (job.acceptedBy === actorId || job.submittedBy === actorId)
    )
}
