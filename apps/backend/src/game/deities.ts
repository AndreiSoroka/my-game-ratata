import {
    type DeityId,
    type DeityMood,
    type DeitySnapshot,
    RESURRECTION_SUCCESS_CAP,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { ashParameters } from './constellationModifiers'
import { constellationModifiers } from './constellations'
import { prayerAnswerChance, prayerMoodQuality } from './prayerProbability'

export const deityMoodCycleMs = 30_000
export const deityDefinitions: Record<
    DeityId,
    { name: string; domain: string; seed: number }
> = {
    grave: {
        name: 'Хранитель Праха',
        domain: 'Покой нежити и холод живым',
        seed: 67,
    },
    hearth: {
        name: 'Угольная Мать',
        domain: 'Исцеление и возвращение к жизни',
        seed: 13,
    },
    road: {
        name: 'Безымянный Путник',
        domain: 'Выносливость и дальняя дорога',
        seed: 29,
    },
    lantern: {
        name: 'Слепой Архивариус',
        domain: 'Ясность мысли и восстановление маны',
        seed: 48,
    },
}
const moods: DeityMood[] = [
    'benevolent',
    'wrathful',
    'neutral',
    'benevolent',
    'neutral',
    'wrathful',
]
const hints: Record<DeityMood, string> = {
    benevolent: 'Знаки обещают благосклонность, но не дают гарантий.',
    neutral: 'Знаки противоречивы. Ответ божества неясен.',
    wrathful: 'В знаках чувствуется раздражение. Чуда можно не дождаться.',
}

export function deityMood(deityId: DeityId, now: number): DeityMood {
    const cycle = Math.floor(now / deityMoodCycleMs)
    const phase = cycle + deityDefinitions[deityId].seed
    const index = ((phase % moods.length) + moods.length) % moods.length
    return moods[index] ?? 'neutral'
}

export function miracleChance(
    character: GameCharacter,
    now: number,
    deityId = character.progression.patron
): number {
    const mood = deityMood(deityId, now)
    return prayerAnswerChance(mood)
}

export function resolveMiracle(
    character: GameCharacter,
    now: number,
    random: () => number = Math.random,
    deityId: DeityId = character.progression.patron
): { success: boolean; quality: number } {
    const mood = deityMood(deityId, now)
    return {
        success: random() < miracleChance(character, now, deityId),
        quality: prayerMoodQuality[mood],
    }
}

export function ashHealingChance(
    character: GameCharacter,
    now: number
): number {
    return Math.min(
        RESURRECTION_SUCCESS_CAP,
        miracleChance(character, now, 'grave') +
            ashParameters(character).healChanceBonus
    )
}

export function snapshotDeity(
    character: GameCharacter,
    now: number,
    id: DeityId = character.progression.patron
): DeitySnapshot {
    const modifiers = constellationModifiers(character)
    const insight =
        id === 'hearth'
            ? modifiers.deityInsight
            : id === 'grave'
              ? Math.max(
                    modifiers.otherDeityInsight,
                    ashParameters(character).omenRank
                )
              : modifiers.otherDeityInsight
    const mood = deityMood(id, now)
    return {
        id,
        name: deityDefinitions[id].name,
        domain: deityDefinitions[id].domain,
        omen:
            insight >= 1
                ? hints[mood]
                : 'Знаки едва различимы. Воля божества непостижима.',
        perception:
            insight >= 4
                ? 'precise'
                : insight >= 2
                  ? 'clear'
                  : insight >= 1
                    ? 'hint'
                    : 'vague',
        mood: insight >= 2 ? mood : null,
        successChance:
            insight >= 3
                ? id === 'grave'
                    ? ashHealingChance(character, now)
                    : miracleChance(character, now, id)
                : null,
        changesInMs:
            insight >= 4 ? deityMoodCycleMs - (now % deityMoodCycleMs) : null,
    }
}

export function snapshotOtherDeities(
    character: GameCharacter,
    now: number
): DeitySnapshot[] {
    return (Object.keys(deityDefinitions) as DeityId[])
        .filter((id) => id !== character.progression.patron)
        .map((id) => snapshotDeity(character, now, id))
        .filter((deity) => deity.perception !== 'vague')
}
