import {
    type GameLocale,
    type LocalizedMessage,
    NPC_ENGLISH_NAMES,
    type QuestObjective,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NpcQuestEnvironment } from './npcQuestTypes'
import { namedQuestPlace, questCompass } from './questExcursions'

export function npcQuestObjectiveMessage(
    objective: QuestObjective,
    environment: NpcQuestEnvironment,
    issuer: GameCharacter
): LocalizedMessage | null {
    if (objective.kind === 'visit') {
        return {
            key: 'authored.npc.quest.visitObjective',
            params: {
                placeRu: place(
                    objective.locationId,
                    objective.position,
                    environment,
                    issuer,
                    'ru'
                ),
                placeEn: place(
                    objective.locationId,
                    objective.position,
                    environment,
                    issuer,
                    'en'
                ),
            },
        }
    }
    if (objective.kind !== 'inspect') {
        return null
    }
    const target = environment.getCharacter(objective.targetId)
    const location = (locale: GameLocale) =>
        target === undefined
            ? ''
            : ` — ${place(target.locationId, target.position, environment, issuer, locale)}`
    return {
        key: 'authored.npc.quest.inspectObjective',
        params: {
            targetRu: target?.nickname ?? objective.targetId,
            targetEn:
                NPC_ENGLISH_NAMES[objective.targetId] ??
                target?.nickname ??
                objective.targetId,
            locationRu: location('ru'),
            locationEn: location('en'),
            question:
                objective.question === undefined
                    ? ''
                    : `. ${objective.question}`,
            issuerRu: issuer.nickname,
            issuerEn: NPC_ENGLISH_NAMES[issuer.id] ?? issuer.nickname,
        },
    }
}

function place(
    locationId: string,
    point: Vector2 | undefined,
    environment: NpcQuestEnvironment,
    issuer: GameCharacter,
    locale: GameLocale
): string {
    const name = namedQuestPlace(locationId, point, environment, locale)
    if (point === undefined || locationId !== issuer.locationId) {
        return name
    }
    const direction = questCompass(issuer.position, point, locale)
    if (locale === 'ru') {
        return `${name} — ${direction} от заказчика`
    }
    return direction === 'nearby'
        ? `${name}, near the quest giver`
        : `${name}, ${direction} of the quest giver`
}
