import type { QuestDraft } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NpcQuestEnvironment } from './npcQuestTypes'

/** An authored reference chooses server data, never model-provided conditions or prices. */
export function resolveAuthoredQuestDraft(
    issuer: GameCharacter,
    targetId: string,
    draft: QuestDraft,
    environment: NpcQuestEnvironment
): QuestDraft | string {
    if (draft.authoredId === undefined) {
        const definition = environment.adventure.cities.definition(
            issuer.locationId
        )
        if (
            definition?.issuerId === issuer.id &&
            draft.objectives.some(
                (objective) =>
                    objective.kind === 'deliver' &&
                    objective.itemId === definition.requiredItemId &&
                    (objective.recipientId === issuer.id ||
                        objective.recipientId === `city:${definition.cityId}`)
            )
        ) {
            return `Для общего городского заказа используй authoredId ${definition.questId}; его условия не создаются заново.`
        }
        return draft
    }
    const error = environment.adventure.storyOfferError(
        issuer,
        targetId,
        draft.authoredId
    )
    return (
        error ??
        environment.adventure.authoredStoryDraft(draft.authoredId) ??
        'Неизвестный авторский городской заказ.'
    )
}
