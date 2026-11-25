import type {
    CharacterSnapshot,
    QuestObjective,
    QuestOfferSnapshot,
} from '@my-game-ratata/contracts'

import {
    characterName,
    gameLocale,
    itemName,
    locationName,
    tGame,
    tLocalized,
} from '@/shared/lib/i18n'

type Terms = Pick<
    QuestOfferSnapshot,
    'issuerId' | 'issuerName' | 'objectiveLabels' | 'objectiveMessages'
>
type Names = ReadonlyArray<Pick<CharacterSnapshot, 'id' | 'nickname'>>

export function questObjectiveText(
    terms: Terms,
    index: number,
    objective: QuestObjective | undefined,
    characters: Names = []
): string {
    const label = terms.objectiveLabels?.[index]
    const message = terms.objectiveMessages?.[index]
    if (message != null) return tLocalized(message, label ?? '')
    if (objective === undefined || (gameLocale.value === 'ru' && label !== undefined))
        return label ?? ''
    const name = (id: string) =>
        id.startsWith('city:')
            ? tGame('game.quests.cityWarehouse')
            : characterName(
                  id,
                  id === terms.issuerId
                      ? terms.issuerName
                      : (characters.find((character) => character.id === id)?.nickname ?? id)
              )
    return describe(objective, name)
}

function describe(objective: QuestObjective, name: (id: string) => string): string {
    if (objective.kind === 'deliver')
        return tGame('game.quests.deliveryObjective', {
            item: itemName(objective.itemId),
            quantity: objective.quantity,
            recipient: name(objective.recipientId),
        })
    if (objective.kind === 'visit')
        return tGame('game.quests.visitObjective', { place: locationName(objective.locationId) })
    if (objective.kind === 'defeat')
        return tGame('game.quests.defeatObjective', {
            enemy: tGame(
                objective.archetype === 'slime' ? 'game.quests.slimes' : 'game.quests.skeletons'
            ),
            quantity: objective.quantity,
            place: locationName(objective.locationId),
        })
    const inquiry = tGame('game.quests.inquireObjective', { target: name(objective.targetId) })
    return objective.question === undefined ? inquiry : `${inquiry} ${objective.question}`
}
