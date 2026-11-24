import type {
    NpcQuestDecision,
    QuestDraft,
    QuestOfferReplacement,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { snapshotItem } from './inventory'
import { recordQuestOffer } from './npcQuestJournal'
export { questRewardWallet } from './npcQuestOfferAssets'
import {
    prepareQuestProposal,
    type QuestProposalDecision,
} from './npcQuestProposalPreparation'
import { prepareQuestRevision, type QuestRevision } from './npcQuestRevision'
import type { NpcQuestResult } from './npcQuests'
import {
    type NpcQuestDecisionContext,
    type NpcQuestEnvironment,
    type QuestOfferRecord,
} from './npcQuestTypes'
import type { QuestJournal } from './questJournal'

const result = (
    accepted: boolean,
    error: string | null = null
): NpcQuestResult => ({ accepted, error, events: [] })
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
        replaceOffer?: QuestOfferReplacement,
        context: NpcQuestDecisionContext = {}
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
        replaceOffer?: QuestOfferReplacement,
        context: NpcQuestDecisionContext = {}
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
        decision: QuestRevision,
        now: number
    ): NpcQuestResult {
        const offer = prepareQuestRevision(this.context, issuer, decision, now)
        if (typeof offer === 'string') {
            return result(false, offer)
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

    public publish(
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

    public previewRevision(
        issuer: GameCharacter,
        decision: QuestRevision,
        now: number
    ): string | undefined {
        const offer = prepareQuestRevision(this.context, issuer, decision, now)
        return typeof offer === 'string' ? offer : undefined
    }

    private newId(prefix: string): string {
        return this.context.environment.adventure.questFunding.newId(
            `npc-${prefix}`
        )
    }
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
