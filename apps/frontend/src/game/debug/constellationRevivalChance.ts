import { type PrayerAbilityId, resolveResurrectionParameters } from '@my-game-ratata/contracts'

import { chanceFormula } from './constellationChanceFormula'
import { chancePercent } from './constellationChanceMath'
import type {
    ConstellationChanceFormula,
    ConstellationEffectChance,
} from './constellationChanceTypes'
import * as math from './constellationPrayerFormulas'

export interface RevivalChanceDescription extends Omit<
    ConstellationEffectChance,
    'formulas' | 'formulaDetails'
> {
    formulaDetails: ConstellationChanceFormula[]
}
const moodBase = '80 при благосклонности; 55 при нейтральном настроении; 25 при гневе.'
const learned = (name: string) => `1, если изучен навык «${name}»; иначе 0.`
const examples = (ability: PrayerAbilityId, active: ReadonlySet<string>) =>
    (['benevolent', 'neutral', 'wrathful'] as const).map((mood) => {
        const result = resolveResurrectionParameters(ability, active, mood)
        return {
            label: {
                benevolent: 'Благосклонность',
                neutral: 'Нейтральное настроение',
                wrathful: 'Гнев',
            }[mood],
            value: `Успех ${chancePercent(result.successChance)}${result.angelicChance > 0 ? `; общий шанс Ангельского ${chancePercent(result.successChance * result.angelicChance)}` : ''}.`,
        }
    })

export function describeRevivalChance(
    nodeId: string,
    ability: PrayerAbilityId
): RevivalChanceDescription | undefined {
    if (nodeId.endsWith('.revive')) {
        const parameters = resolveResurrectionParameters(ability, new Set(), 'neutral')
        return {
            summary: 'Шанс воскрешения зависит от настроения своего божества.',
            formulaDetails: [
                chanceFormula('Шанс воскрешения, %', 'B', { B: moodBase }),
                math.prayerAnswerRollFormula(),
                math.prayerRevivalHpFormula(parameters.hpFraction),
                math.prayerRevivalResourceFormula(
                    parameters.resourceFraction,
                    parameters.minimumResource
                ),
            ],
            examples: examples(ability, new Set()),
            notes: [
                'Для одной выбранной павшей цели выполняется один случайный бросок.',
                'Лечебные множители не меняют ресурсы после воскрешения.',
            ],
        }
    }
    if (nodeId === 'prayer.revive_angelic') return angelicChance()
    const enhancements: Record<string, ConstellationChanceFormula[]> = {
        'prayer.revive_higher': [math.prayerRevivalHpFormula(0.75)],
        'prayer.revive_experienced': [chanceFormula('Добавка к шансу воскрешения, п.п.', '10')],
        'prayer.revive_master': [chanceFormula('Добавка к шансу воскрешения, п.п.', '10')],
        'prayer.revive_stable': [
            math.prayerRevivalHpFormula(1),
            chanceFormula('Добавка к шансу воскрешения, п.п.', '5'),
        ],
    }
    const formulaDetails = enhancements[nodeId]
    return formulaDetails === undefined
        ? undefined
        : {
              deterministic: true,
              summary: 'Изученный навык изменяет только свои параметры воскрешения.',
              formulaDetails,
              examples: [],
              notes: ['Итоговый результат всех изученных усилений показан у Молитвы.'],
          }
}
function angelicChance(): RevivalChanceDescription {
    return {
        summary:
            'После успешного воскрешения отдельный бросок с вероятностью 30% возвращает по 150% HP, маны и энергии.',
        formulaDetails: [
            chanceFormula('Ангельское при успешном воскрешении, %', '30'),
            chanceFormula('Условие Ангельского воскрешения', 'r < 0,30', {
                r: 'Отдельный случайный бросок после успешного воскрешения: от 0 включительно до 1 не включительно.',
            }),
            math.prayerRevivalHpFormula(1.5),
            math.prayerRevivalResourceFormula(1.5, 1),
        ],
        examples: [],
        notes: [
            'Доли заменяют обычное восстановление, а не складываются с ним.',
            'Избыток ресурсов не меняет максимумы и остаётся до получения урона или расходования.',
        ],
    }
}
export function rootRevivalChance(
    ability: PrayerAbilityId,
    active: ReadonlySet<string>
): RevivalChanceDescription {
    const parameters = resolveResurrectionParameters(ability, active, 'neutral')
    const mother = ability === 'pray'
    const formulaDetails = [
        mother
            ? chanceFormula('Шанс воскрешения, %', 'min(95, B + 10 × E + 10 × M + 5 × S)', {
                  B: moodBase,
                  E: learned('Опытное воскрешение'),
                  M: learned('Мастер воскрешений'),
                  S: learned('Стабильное воскрешение'),
              })
            : chanceFormula('Шанс воскрешения, %', 'B', { B: moodBase }),
        math.prayerRevivalHpFormula(parameters.hpFraction),
        math.prayerRevivalResourceFormula(parameters.resourceFraction, parameters.minimumResource),
    ]
    if (parameters.angelicChance > 0) {
        formulaDetails.push(
            ...angelicChance().formulaDetails,
            chanceFormula('Общий шанс Ангельского воскрешения, %', 'P × A / 100', {
                P: 'Итоговый шанс успешного воскрешения в процентах.',
                A: 'Условный шанс Ангельского после успеха: 30%.',
            })
        )
    }
    return {
        summary: '',
        formulaDetails,
        examples: examples(ability, active).map((example) => ({
            ...example,
            label: `Воскрешение · ${example.label}`,
        })),
        notes: [],
    }
}
