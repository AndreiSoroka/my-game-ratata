import type {
    QuestDraft,
    QuestOfferReplacement,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    type NpcQuestDecisionContext,
    type NpcQuestEnvironment,
    type NpcQuestResult,
    questOfferAvailable,
    type QuestOfferRecord,
} from './npcQuestTypes'

interface OfferGuardContext {
    environment: NpcQuestEnvironment
    offers: ReadonlyMap<string, QuestOfferRecord>
}

export function questProposalGuard(
    context: OfferGuardContext,
    issuer: GameCharacter,
    targetId: string,
    now: number,
    source: QuestDraft | string,
    replaceOffer: QuestOfferReplacement | undefined,
    execution: NpcQuestDecisionContext
): NpcQuestResult | undefined {
    const current = context.offers.get(targetId)
    const replacementError = replacementFailure(
        context,
        issuer,
        targetId,
        now,
        current,
        replaceOffer,
        execution
    )
    if (replacementError !== undefined) {
        return rejected(replacementError)
    }
    if (
        current === undefined ||
        !questOfferAvailable(current, context.environment, now)
    ) {
        return undefined
    }
    const same =
        current.view.issuerId === issuer.id &&
        (typeof source === 'string'
            ? current.view.workerRequestId === source
            : JSON.stringify(current.draft) === JSON.stringify(source))
    if (same) {
        return { accepted: true, error: null, events: [] }
    }
    return replaceOffer === undefined
        ? rejected(
              'У собеседника уже есть предложение. Для замены укажите его текущую версию в ответ на новое обращение.'
          )
        : undefined
}

function replacementFailure(
    context: OfferGuardContext,
    issuer: GameCharacter,
    targetId: string,
    now: number,
    current: QuestOfferRecord | undefined,
    replaceOffer: QuestOfferReplacement | undefined,
    execution: NpcQuestDecisionContext
): string | undefined {
    if (replaceOffer === undefined) {
        return undefined
    }
    if (execution.freshDialogueTargetId !== targetId) {
        return 'Заменить предложение можно только в ответ на новое обращение этого игрока.'
    }
    if (
        current?.view.issuerId !== issuer.id ||
        current.view.id !== replaceOffer.offerId ||
        current.view.revision !== replaceOffer.revision ||
        !questOfferAvailable(current, context.environment, now)
    ) {
        return 'Предложение изменилось или уже недоступно. Проверьте актуальные условия.'
    }
    return undefined
}

function rejected(error: string): NpcQuestResult {
    return { accepted: false, error, events: [] }
}
