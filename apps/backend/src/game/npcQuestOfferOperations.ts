import type { NpcQuestDecision, QuestDraft } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { snapshotItem } from './inventory'
import { recordQuestOffer } from './npcQuestJournal'
import { createQuestOffer, createWorkerQuestOffer } from './npcQuestOffers'
import type { NpcQuestResult } from './npcQuests'
import {
    type NpcQuestEnvironment,
    questContact,
    questOfferAvailable,
    type QuestOfferRecord,
} from './npcQuestTypes'
import type { QuestJournal } from './questJournal'
import {
    type AssetWallet,
    availableGold,
    availableInventoryQuantity,
} from './rewardReservations'

const result = (
    accepted: boolean,
    error: string | null = null
): NpcQuestResult => ({ accepted, error, events: [] })
type Revision = Extract<NpcQuestDecision, { type: 'quest_offer_revise' }>
interface OfferContext {
    environment: NpcQuestEnvironment
    offers: Map<string, QuestOfferRecord>
    journal: QuestJournal
}

export function questRewardWallet(
    environment: NpcQuestEnvironment,
    offer: Pick<QuestOfferRecord, 'view'>,
    issuer: GameCharacter
): AssetWallet | undefined {
    return offer.view.funding === 'city' || offer.view.funding === 'worker'
        ? environment.adventure.questFunding.wallet(
              offer.view.fundingCityId ?? issuer.locationId
          )
        : environment.adventure.walletFor(issuer.id)
}

export class NpcQuestOfferOperations {
    public constructor(private readonly context: OfferContext) {}

    public propose(
        issuer: GameCharacter,
        targetId: string,
        draft: QuestDraft,
        now: number
    ): NpcQuestResult {
        const guard = this.guard(issuer, targetId, now, draft)
        if (guard !== undefined) {
            return guard
        }
        const offer = createQuestOffer(
            issuer,
            targetId,
            draft,
            this.context.environment,
            this.newId('offer'),
            now
        )
        return this.publish(issuer, targetId, offer, now)
    }

    public workerPropose(
        issuer: GameCharacter,
        targetId: string,
        requestId: string,
        now: number
    ): NpcQuestResult {
        const guard = this.guard(issuer, targetId, now, requestId)
        if (guard !== undefined) {
            return guard
        }
        const offer = createWorkerQuestOffer(
            issuer,
            targetId,
            requestId,
            this.context.environment,
            this.newId('worker-offer'),
            now
        )
        return this.publish(issuer, targetId, offer, now)
    }

    public revise(
        issuer: GameCharacter,
        decision: Revision,
        now: number
    ): NpcQuestResult {
        const offer = this.currentRevision(issuer, decision, now)
        if (offer === undefined) {
            return result(false, 'Предложение или собеседник уже недоступны.')
        }
        if (!validSelection(decision)) {
            return result(false, 'Некорректная награда.')
        }
        const wallet = questRewardWallet(
            this.context.environment,
            offer,
            issuer
        )
        if (
            wallet === undefined ||
            availableGold(wallet) < decision.rewardGold ||
            !availableSelection(issuer, decision.rewardItems)
        ) {
            return result(
                false,
                'У заказчика нет свободной награды для этих условий.'
            )
        }
        const rewards = decision.rewardItems.flatMap((selected) => {
            const item = issuer.inventory.find(
                (entry) => entry.instanceId === selected.instanceId
            )
            return item === undefined
                ? []
                : [{ ...snapshotItem(item), quantity: selected.quantity }]
        })
        if (
            offer.view.rewardGold === decision.rewardGold &&
            rewardFingerprint(offer.view.rewardItems) ===
                rewardFingerprint(rewards)
        ) {
            return result(true)
        }
        offer.view.rewardGold = decision.rewardGold
        offer.view.rewardItems = rewards
        offer.view.revision++
        if (offer.draft !== null) {
            offer.draft.rewardGold = decision.rewardGold
            offer.draft.rewardItems = structuredClone(decision.rewardItems)
        }
        recordQuestOffer(this.context.journal, offer, 'revised', now)
        return result(true)
    }

    private publish(
        issuer: GameCharacter,
        targetId: string,
        offer: QuestOfferRecord | string,
        now: number
    ): NpcQuestResult {
        if (typeof offer === 'string') {
            return result(false, offer)
        }
        const wallet = questRewardWallet(
            this.context.environment,
            offer,
            issuer
        )
        const selection = offer.view.rewardItems.map((item) => ({
            instanceId: item.instanceId,
            quantity: item.quantity ?? 1,
        }))
        if (
            wallet === undefined ||
            availableGold(wallet) < offer.view.rewardGold ||
            !availableSelection(issuer, selection)
        ) {
            return result(
                false,
                'У меня сейчас нет свободной награды для такого обещания.'
            )
        }
        this.context.offers.set(targetId, offer)
        recordQuestOffer(this.context.journal, offer, 'offered', now)
        return result(true)
    }

    private guard(
        issuer: GameCharacter,
        targetId: string,
        now: number,
        source: QuestDraft | string
    ): NpcQuestResult | undefined {
        const current = this.context.offers.get(targetId)
        if (
            current !== undefined &&
            questOfferAvailable(current, this.context.environment, now)
        ) {
            const same =
                current.view.issuerId === issuer.id &&
                (typeof source === 'string'
                    ? current.view.workerRequestId === source
                    : JSON.stringify(current.draft) === JSON.stringify(source))
            return result(
                same,
                same
                    ? null
                    : 'У собеседника уже есть предложение. Дождитесь его решения; новое не заменяет прежнее.'
            )
        }
        if (current !== undefined) {
            recordQuestOffer(this.context.journal, current, 'expired', now)
            this.context.offers.delete(targetId)
        }
        if (this.context.environment.parties.contractGroup(targetId).occupied) {
            return result(
                false,
                'У собеседника уже есть действующий договор. Напомните его условия вместо нового предложения.'
            )
        }
        return undefined
    }

    private currentRevision(
        issuer: GameCharacter,
        decision: Revision,
        now: number
    ): QuestOfferRecord | undefined {
        const offer = this.context.offers.get(decision.targetId)
        const target = this.context.environment.getCharacter(decision.targetId)
        if (offer === undefined || target === undefined) {
            return undefined
        }
        if (
            offer.view.id !== decision.offerId ||
            offer.view.issuerId !== issuer.id ||
            offer.view.revision !== decision.revision ||
            offer.view.expiresAt <= now ||
            issuer.deathSequence !== offer.issuerDeath ||
            !questContact(target, issuer, this.context.environment, now)
        ) {
            return undefined
        }
        return offer
    }

    private newId(prefix: string): string {
        return this.context.environment.adventure.questFunding.newId(
            `npc-${prefix}`
        )
    }
}

function validSelection(decision: Revision): boolean {
    return (
        Number.isSafeInteger(decision.rewardGold) &&
        decision.rewardGold >= 0 &&
        decision.rewardGold <= 300 &&
        decision.rewardItems.length <= 10 &&
        new Set(decision.rewardItems.map((item) => item.instanceId)).size ===
            decision.rewardItems.length
    )
}
function availableSelection(
    issuer: GameCharacter,
    selection: Revision['rewardItems']
): boolean {
    return selection.every(
        (item) =>
            Number.isSafeInteger(item.quantity) &&
            item.quantity > 0 &&
            item.quantity <= 100 &&
            availableInventoryQuantity(issuer.inventory, item.instanceId) >=
                item.quantity
    )
}

function rewardFingerprint(
    items: ReadonlyArray<
        import('@my-game-ratata/contracts').ItemInstanceSnapshot
    >
): string {
    return JSON.stringify(
        [...items].sort((left, right) =>
            left.instanceId.localeCompare(right.instanceId)
        )
    )
}
