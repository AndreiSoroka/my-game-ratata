import type { DeityMood } from '@my-game-ratata/contracts'

import {
    prayerAnswerChance,
    prayerHarmChance,
    prayerPurificationChance,
} from '../../../../backend/src/game/prayerProbability'
import type { ConstellationEffectChance } from './constellationChanceTypes'

const moodNames: Record<DeityMood, string> = {
    benevolent: 'благосклонность',
    neutral: 'нейтральное настроение',
    wrathful: 'гнев',
}
const moods: DeityMood[] = ['benevolent', 'neutral', 'wrathful']

export function prayerChanceExamples(
    faithName: string,
    mode: 'answer' | 'grave' | 'harm' = 'answer'
): ConstellationEffectChance['examples'] {
    return [1, 10].flatMap((faith) =>
        moods.map((mood) => {
            const chance = prayerAnswerChance(faith, mood)
            const derived =
                mode === 'grave'
                    ? `; шаг очищения ${percent(prayerPurificationChance(chance))}`
                    : mode === 'harm'
                      ? `; кара ${percent(prayerHarmChance(chance))}`
                      : ''
            return {
                label: `${faithName} ${faith} · ${moodNames[mood]}`,
                value: `Ответ ${percent(chance)}; отказ ${percent(1 - chance)}${derived}.`,
            }
        })
    )
}
function percent(value: number): string {
    return `${Number((value * 100).toFixed(2))
        .toString()
        .replace('.', ',')}%`
}
