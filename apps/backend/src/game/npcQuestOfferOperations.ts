import type {
    NpcQuestDecision,
    QuestDraft,
    QuestOfferReplacement,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { snapshotItem } from './inventory'
import { recordQuestOffer } from './npcQuestJournal'
import { questRewardWallet } from './npcQuestOfferAssets'
export { questRewardWallet } from './npcQuestOfferAssets'
import {
    prepareQuestProposal,
    type QuestProposalDecision,
} from './npcQuestProposalPreparation'
import type { NpcQuestResult } from './npcQuests'
import {
    type NpcQuestDecisionContext,
    type NpcQuestEnvironment,
    questContact,
    type QuestOfferRecord,
} from './npcQuestTypes'
import type { QuestJournal } from './questJournal'
import { availableGold, availableInventoryQuantity } from './rewardReservations'

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

export class NpcQuestOfferOperations {
    public constructor(private readonly context: OfferContext) {}

    public decide(
        issuer: GameCharacter,
        decision: Extract<
            NpcQuestDecision,
            { type: 'quest_propose' | 'worker_quest_propose' }
        >,
        now: number,
        context: NpcQuestDecisionContext
    ): NpcQuestResult {
        const prepared = prepareQuestProposal(
            this.context,
            issuer,
            decision,
            now,
            context
        )
        if (!('view' in prepared)) {
            return prepared
        }
        prepared.view.id = this.newId(
            decision.type === 'quest_propose' ? 'offer' : 'worker-offer'
        )
        return this.publish(decision.targetId, prepared, now)
    }

    public preview(
        issuer: GameCharacter,
        decision: QuestProposalDecision,
        now: number,
        context: NpcQuestDecisionContext
    ): string | undefined {
        const prepared = prepareQuestProposal(
            this.context,
            issuer,
            decision,
            now,
            context
        )
        return 'view' in prepared || prepared.accepted
            ? undefined
            : (prepared.error ?? 'Предложение недоступно.')
    }

    public prepare(
        issuer: GameCharacter,
        decision: QuestProposalDecision,
        now: number,
        context: NpcQuestDecisionContext
    ) {
        return prepareQuestProposal(
            this.context,
            issuer,
            decision,
            now,
            context
        )
    }

    public propose(
        issuer: GameCharacter,
        targetId: string,
        draft: QuestDraft,
        now: number,
        replaceOffer: QuestOfferReplacement | undefined,
        context: NpcQuestDecisionContext
    ): NpcQuestResult {
        return this.decide(
            issuer,
            {
                type: 'quest_propose',
                targetId,
                draft,
                ...(replaceOffer === undefined ? {} : { replaceOffer }),
            },
            now,
            context
        )
    }

    public workerPropose(
        issuer: GameCharacter,
        targetId: string,
        requestId: string,
        now: number,
        replaceOffer: QuestOfferReplacement | undefined,
        context: NpcQuestDecisionContext
    ): NpcQuestResult {
        return this.decide(
            issuer,
            {
                type: 'worker_quest_propose',
                targetId,
                requestId,
                ...(replaceOffer === undefined ? {} : { replaceOffer }),
            },
            now,
            context
        )
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
        targetId: string,
        offer: QuestOfferRecord,
        now: number
    ): NpcQuestResult {
        const previous = this.context.offers.get(targetId)
        if (previous !== undefined) {
            recordQuestOffer(
                this.context.journal,
                previous,
                previous.view.expiresAt <= now ? 'expired' : 'cancelled',
                now
            )
        }
        this.context.offers.set(targetId, offer)
        recordQuestOffer(this.context.journal, offer, 'offered', now)
        return result(true)
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
