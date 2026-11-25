import {
    type CharacterArchetype,
    HOSTILE_TROPHY_ITEMS,
    type NpcQuestSnapshot,
    type QuestObjective,
} from '@my-game-ratata/contracts'

import { guildHuntArchetype } from './guildRules'
import type { BoardQuest } from './questBoardCatalog'
import { localizedQuestTitle, type QuestChatTitle } from './questChatWords'

export function offerOverlap(
    order: BoardQuest,
    active: NpcQuestSnapshot[]
): QuestOverlap | undefined {
    const offered = huntGoals(order.entry.id, order.objectives)
    for (const job of active) {
        if (job.status !== 'active') {
            continue
        }
        const remaining = job.objectives.filter(
            (objective, index) =>
                !('quantity' in objective) ||
                (job.progress[index] ?? 0) < objective.quantity
        )
        const existing = huntGoals(job.id, remaining)
        if (
            offered.some((a) =>
                existing.some(
                    (b) =>
                        a.archetype === b.archetype &&
                        (a.locationId === undefined ||
                            b.locationId === undefined ||
                            a.locationId === b.locationId)
                )
            )
        ) {
            return { quest: job, kind: 'defeat' }
        }
        if (
            lootSupports(offered, remaining) ||
            lootSupports(existing, order.objectives)
        ) {
            return { quest: job, kind: 'trophy' }
        }
    }
    return undefined
}

interface HuntGoal {
    archetype: CharacterArchetype
    locationId?: string
}

export interface QuestOverlap {
    quest: QuestChatTitle
    kind: 'defeat' | 'trophy'
}

function huntGoals(id: string, objectives: QuestObjective[]): HuntGoal[] {
    const guildHunt = guildHuntArchetype(id)
    return guildHunt === undefined
        ? objectives.filter((objective) => objective.kind === 'defeat')
        : [{ archetype: guildHunt }]
}

function lootSupports(
    hunts: HuntGoal[],
    objectives: QuestObjective[]
): boolean {
    return hunts.some(({ archetype }) =>
        objectives.some(
            (goal) =>
                goal.kind === 'deliver' &&
                goal.itemId === HOSTILE_TROPHY_ITEMS[archetype]
        )
    )
}

export function overlapHint(
    overlap: QuestOverlap | undefined,
    locale: 'ru' | 'en'
): string {
    if (overlap === undefined) {
        return ''
    }
    const title = localizedQuestTitle(overlap.quest, locale)
    if (overlap.kind === 'defeat') {
        return locale === 'ru'
            ? ` Можно делать вместе с «${title}»: подходящая победа засчитается в оба поручения.`
            : ` You can do this alongside “${title}”: a qualifying victory counts toward both quests.`
    }
    return locale === 'ru'
        ? ` Можно делать вместе с «${title}»: в охоте можно добыть нужные трофеи. Сдача отдельная.`
        : ` You can do this alongside “${title}”: the hunt can provide the trophies. Turn them in separately.`
}
