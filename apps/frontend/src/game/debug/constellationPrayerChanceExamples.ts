import type { DeityMood } from '@my-game-ratata/contracts'

import {
    prayerAnswerChance,
    prayerHarmChance,
    prayerPurificationChance,
} from '../../../../backend/src/game/prayerProbability'
import { chancePercent } from './constellationChanceMath'
import type { ConstellationEffectChance } from './constellationChanceTypes'

const moodNames: Record<DeityMood, string> = {
    benevolent: 'Благосклонность',
    neutral: 'Нейтральное настроение',
    wrathful: 'Гнев',
}
export function prayerChanceExamples(
    schoolName: string,
    mode: 'answer' | 'grave' | 'harm' = 'answer'
): ConstellationEffectChance['examples'] {
    return (['benevolent', 'neutral', 'wrathful'] as const).map((mood) => {
        const chance = prayerAnswerChance(mood)
        const derived =
            mode === 'grave'
                ? `; очищение ${chancePercent(prayerPurificationChance(chance))} за шаг`
                : mode === 'harm'
                  ? `; кара ${chancePercent(prayerHarmChance(chance))}`
                  : ''
        return {
            label: `${schoolName} · ${moodNames[mood]}`,
            value: `Успех ${chancePercent(chance)}${derived}.`,
        }
    })
}
