import type { QuestDraft } from '@my-game-ratata/contracts'

import { resolveAuthoredQuestDraft } from './authoredQuestOffers'
import type { GameCharacter } from './character'
import { guildQuests } from './guildRules'
import type { NpcQuestEnvironment } from './npcQuestTypes'
import { validateQuestDraft } from './npcQuestValidation'
import type { PublicQuestPosting } from './questBoardPublications'
import { validateQuestExcursion } from './questExcursions'

export function publicationDraftError(
    issuer: GameCharacter,
    draft: QuestDraft,
    environment: NpcQuestEnvironment
): string | undefined {
    const error =
        validateQuestDraft(issuer, draft, environment) ??
        validateQuestExcursion(issuer, draft, environment)
    if (error !== null) {
        return error
    }
    if (
        draft.funding !== 'city' ||
        draft.authoredId !== undefined ||
        draft.rewardGold <= 0 ||
        draft.rewardItems.length > 0
    ) {
        return 'Новый заказ на доске должен иметь награду золотом из городского фонда.'
    }
    if (normalizeTitle(draft.title) === '') {
        return 'Для нового заказа нужно название.'
    }
    const authored = resolveAuthoredQuestDraft(
        issuer,
        issuer.id,
        draft,
        environment
    )
    return typeof authored === 'string' ? authored : undefined
}

export function duplicatesPublication(
    issuer: GameCharacter,
    draft: QuestDraft,
    cityPostings: PublicQuestPosting[],
    environment: NpcQuestEnvironment
): boolean {
    const title = normalizeTitle(draft.title)
    const fingerprint = objectiveFingerprint(draft)
    const usesWorkerProof =
        draft.objectives.length === 1 &&
        draft.objectives.some(
            (objective) =>
                objective.kind === 'deliver' &&
                objective.quantity === 1 &&
                objective.recipientId === issuer.id &&
                environment.workers
                    .list(issuer.locationId)
                    .some(
                        (request) =>
                            request.requiredTrophyItemId === objective.itemId
                    )
        )
    return (
        usesWorkerProof ||
        guildQuests.some((quest) => normalizeTitle(quest.title) === title) ||
        normalizeTitle(
            environment.adventure.cities.definition(issuer.locationId)?.title ??
                ''
        ) === title ||
        cityPostings.some(
            (posting) =>
                normalizeTitle(posting.draft.title) === title ||
                objectiveFingerprint(posting.draft) === fingerprint
        )
    )
}

function normalizeTitle(title: string): string {
    return title
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^\p{L}\p{N}]+/gu, '')
}

function objectiveFingerprint(draft: QuestDraft): string {
    return draft.objectives
        .map((objective) => {
            switch (objective.kind) {
                case 'deliver':
                    return JSON.stringify([
                        objective.kind,
                        objective.itemId,
                        objective.quantity,
                        objective.recipientId,
                    ])
                case 'visit':
                    return JSON.stringify([
                        objective.kind,
                        objective.locationId,
                        objective.position?.x,
                        objective.position?.y,
                    ])
                case 'defeat':
                    return JSON.stringify([
                        objective.kind,
                        objective.archetype,
                        objective.locationId,
                        objective.quantity,
                    ])
                case 'inspect':
                    return JSON.stringify([objective.kind, objective.targetId])
            }
        })
        .sort()
        .join('\n')
}
