import {
    getWorldLocationDefinition,
    type LocalizedMessage,
    type QuestDraft,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { npcQuestObjectiveMessage } from './npcQuestObjectiveText'
import { objectiveLabel } from './npcQuestOffers'
import {
    type NpcQuestDecisionContext,
    type NpcQuestEnvironment,
    publicationAvailable,
    questActorAvailable,
} from './npcQuestTypes'
import {
    duplicatesPublication,
    publicationDraftError,
} from './questBoardPublicationDraft'
import { WORKER_SETTLEMENT_PROFILES } from './workerRequestData'

const MAX_OPEN_POSTINGS = 3
const POSTING_LIFETIME_MS = 30 * 60_000

export interface PublicQuestPosting {
    id: string
    revision: number
    issuerId: string
    issuerName: string
    issuerDeath: number
    cityId: string
    expiresAt: number
    draft: QuestDraft
    objectiveLabels: string[]
    objectiveMessages: Array<LocalizedMessage | null>
    status: 'open' | 'claimed' | 'closed'
}

/** Open and claimed orders share one reservation and one settlement identity. */
export class QuestBoardPublications {
    private readonly postings = new Map<string, PublicQuestPosting>()
    private readonly spentByCity = new Map<string, number>()
    private readonly nextPublicationByCity = new Map<string, number>()

    public constructor(private readonly environment: NpcQuestEnvironment) {}

    public list(now: number): PublicQuestPosting[] {
        return [...this.postings.values()].filter((posting) =>
            publicationAvailable(posting, this.environment, now)
        )
    }

    public get(id: string, now: number): PublicQuestPosting | undefined {
        const posting = this.postings.get(id)
        return posting !== undefined &&
            publicationAvailable(posting, this.environment, now)
            ? posting
            : undefined
    }

    public validate(
        issuer: GameCharacter,
        draft: QuestDraft,
        now: number,
        context: NpcQuestDecisionContext
    ): string | undefined {
        const cityId = issuer.locationId
        if (
            !this.canPublish(issuer) ||
            context.cityReviewIntervalMs === undefined
        ) {
            return 'Публиковать заказы может распорядитель во время городского обзора.'
        }
        if ((this.nextPublicationByCity.get(cityId) ?? 0) > now) {
            return 'Дождитесь следующего городского обзора для новой публикации.'
        }
        const error = publicationDraftError(issuer, draft, this.environment)
        if (error !== undefined) {
            return error
        }
        const cityPostings = [...this.postings.values()].filter(
            (posting) =>
                posting.cityId === cityId &&
                (posting.status === 'claimed' ||
                    publicationAvailable(posting, this.environment, now))
        )
        if (
            cityPostings.filter((posting) => posting.status === 'open')
                .length >= MAX_OPEN_POSTINGS
        ) {
            return 'На доске уже три новых открытых заказа.'
        }
        if (
            duplicatesPublication(issuer, draft, cityPostings, this.environment)
        ) {
            return 'Такой заказ уже есть.'
        }
        return this.withinBudget(cityId, draft.rewardGold, cityPostings)
            ? undefined
            : 'Для нового объявления не хватает свободного городского золота.'
    }

    private withinBudget(
        cityId: string,
        reward: number,
        postings: PublicQuestPosting[]
    ): boolean {
        const initialGold =
            getWorldLocationDefinition(cityId)?.municipalQuestGold ?? 300
        const reserved = postings.reduce(
            (sum, posting) => sum + posting.draft.rewardGold,
            0
        )
        const spent = this.spentByCity.get(cityId) ?? 0
        return (
            spent + reserved + reward <= Math.floor(initialGold / 4) &&
            this.environment.adventure.questFunding.availableGold(cityId) >=
                reward
        )
    }

    private canPublish(issuer: GameCharacter): boolean {
        return (
            questActorAvailable(issuer) &&
            issuer.controllerKind !== 'network_player' &&
            this.environment.canIssue?.(issuer) !== false &&
            WORKER_SETTLEMENT_PROFILES.some(
                (profile) =>
                    profile.clerkId === issuer.id &&
                    profile.cityId === issuer.locationId
            )
        )
    }

    public publish(
        issuer: GameCharacter,
        draft: QuestDraft,
        now: number,
        context: NpcQuestDecisionContext
    ): string | undefined {
        this.update(now)
        const error = this.validate(issuer, draft, now, context)
        if (error !== undefined || context.cityReviewIntervalMs === undefined) {
            return error
        }
        const funding = this.environment.adventure.questFunding
        const cityId = issuer.locationId
        const wallet = funding.wallet(cityId)
        const id = funding.newId('board-order')
        if (
            wallet === undefined ||
            !funding.reservations.reserve(
                id,
                { inventory: issuer.inventory, wallet },
                draft.rewardGold,
                []
            )
        ) {
            return 'Для нового объявления не хватает свободного городского золота.'
        }
        this.postings.set(id, {
            id,
            revision: 1,
            issuerId: issuer.id,
            issuerName: issuer.nickname,
            issuerDeath: issuer.deathSequence,
            cityId,
            expiresAt: now + POSTING_LIFETIME_MS,
            draft: structuredClone(draft),
            objectiveLabels: draft.objectives.map((objective) =>
                objectiveLabel(objective, this.environment, issuer)
            ),
            objectiveMessages: draft.objectives.map((objective) =>
                npcQuestObjectiveMessage(objective, this.environment, issuer)
            ),
            status: 'open',
        })
        this.nextPublicationByCity.set(
            cityId,
            now + context.cityReviewIntervalMs
        )
        return undefined
    }

    public update(now: number): void {
        for (const posting of this.postings.values()) {
            if (
                posting.status === 'open' &&
                !publicationAvailable(posting, this.environment, now)
            ) {
                this.finish(posting.id, false)
            }
        }
    }

    public closeOpen(issuerId?: string): void {
        for (const posting of this.postings.values()) {
            if (
                posting.status === 'open' &&
                (issuerId === undefined || posting.issuerId === issuerId)
            ) {
                this.finish(posting.id, false)
            }
        }
    }

    public finish(id: string, paid: boolean): void {
        const posting = this.postings.get(id)
        if (posting === undefined) {
            return
        }
        if (posting.status === 'open') {
            this.environment.adventure.questFunding.reservations.release(id)
        }
        posting.status = 'closed'
        this.postings.delete(id)
        if (paid) {
            this.spentByCity.set(
                posting.cityId,
                (this.spentByCity.get(posting.cityId) ?? 0) +
                    posting.draft.rewardGold
            )
        }
    }
}
