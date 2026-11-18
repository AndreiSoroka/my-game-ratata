import type { NpcQuestDecision } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { questOfferAssetError } from './npcQuestOfferAssets'
import { questProposalGuard } from './npcQuestOfferGuard'
import { createQuestOffer, createWorkerQuestOffer } from './npcQuestOffers'
import type {
    NpcQuestDecisionContext,
    NpcQuestEnvironment,
    NpcQuestResult,
    QuestOfferRecord,
} from './npcQuestTypes'

export type QuestProposalDecision = Extract<
    NpcQuestDecision,
    { type: 'quest_propose' | 'worker_quest_propose' }
>
export interface QuestProposalContext {
    environment: NpcQuestEnvironment
    offers: ReadonlyMap<string, QuestOfferRecord>
}

/** Preparation is side-effect free: no ID allocation, reservations, journal or published offer. */
export function prepareQuestProposal(
    context: QuestProposalContext,
    issuer: GameCharacter,
    decision: QuestProposalDecision,
    now: number,
    execution: NpcQuestDecisionContext,
    id = 'quest-preview'
): QuestOfferRecord | NpcQuestResult {
    const guard = questProposalGuard(
        context,
        issuer,
        decision.targetId,
        now,
        decision.type === 'quest_propose' ? decision.draft : decision.requestId,
        decision.replaceOffer,
        execution
    )
    if (guard !== undefined) {
        return guard
    }
    const offer =
        decision.type === 'quest_propose'
            ? createQuestOffer(
                  issuer,
                  decision.targetId,
                  decision.draft,
                  context.environment,
                  id,
                  now
              )
            : createWorkerQuestOffer(
                  issuer,
                  decision.targetId,
                  decision.requestId,
                  context.environment,
                  id,
                  now
              )
    if (typeof offer === 'string') {
        return rejected(offer)
    }
    const error = questOfferAssetError(context.environment, issuer, offer)
    if (error !== undefined) {
        return rejected(error)
    }
    if (execution.introduction !== undefined) {
        offer.view.introduction = execution.introduction.trim()
    }
    return offer
}

export function questIntroductionError(
    execution: NpcQuestDecisionContext
): string | undefined {
    return execution.autonomous !== undefined &&
        (execution.introduction === undefined ||
            execution.introduction.trim().length === 0 ||
            execution.introduction.length > 400)
        ? 'Предложение нужно сопроводить собственной короткой репликой.'
        : undefined
}

export function questPresentationContextError(
    targetId: string,
    now: number,
    execution: NpcQuestDecisionContext
): string | undefined {
    return execution.autonomous === false &&
        (execution.freshDialogueTargetId !== targetId ||
            execution.freshDialogueMessageId === undefined ||
            execution.freshDialogueMessageId.length === 0 ||
            execution.freshDialogueAt === undefined ||
            !Number.isFinite(execution.freshDialogueAt) ||
            execution.freshDialogueAt > now)
        ? 'Показать условия можно только в ответ на новую адресованную реплику этого игрока.'
        : undefined
}

function rejected(error: string): NpcQuestResult {
    return { accepted: false, error, events: [] }
}
