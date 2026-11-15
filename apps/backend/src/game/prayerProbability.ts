import {
    type DeityMood,
    GRAVE_PURIFY_BASE_CHANCE,
    PRAYER_RULES,
} from '@my-game-ratata/contracts'

/** Pure shared math: no character state, clocks or random draws. */
export const prayerChanceCap = 0.95
export const prayerMoodBaseChance: Readonly<Record<DeityMood, number>> =
    Object.freeze({ benevolent: 0.8, neutral: 0.55, wrathful: 0.25 })
export const prayerMoodQuality: Readonly<Record<DeityMood, number>> =
    Object.freeze({ benevolent: 1.3, neutral: 1, wrathful: 0.65 })

export function prayerAnswerChance(mood: DeityMood): number {
    return prayerMoodBaseChance[mood]
}

export function prayerPurificationChance(answerChance: number): number {
    return Math.min(
        prayerChanceCap,
        (GRAVE_PURIFY_BASE_CHANCE * answerChance) / prayerMoodBaseChance.neutral
    )
}

export function prayerHarmChance(answerChance: number): number {
    return Math.min(
        prayerChanceCap,
        answerChance + PRAYER_RULES.harmChanceBonus
    )
}
