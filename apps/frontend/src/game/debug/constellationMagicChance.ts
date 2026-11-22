import { CITY_PORTAL_MANA_FRACTION, MAGIC_ABILITY_RULES } from '@my-game-ratata/contracts'

import {
    manaRestMultipliers,
    spellManaMultipliers,
} from '../../../../backend/src/game/constellationMagicStars'
import { chanceFormula } from './constellationChanceFormula'
import type { DeterministicEffect } from './constellationOtherChanceDetails'

const ordinaryAttack =
    'Попадание по допустимой цели отдельно проверяет уклонение и крит; барьер может поглотить весь рассчитанный урон.'
const round = { round: 'Округление до ближайшего целого.' }

export const magicDeterministicEffects: Record<string, DeterministicEffect> = {
    'magic.spark_damage': {
        formulas: [
            chanceFormula('Рассчитанный урон Искры', 'max(1, round(R × C × A × 1.10))', {
                R: 'Целочисленный бросок базового урона Искры.',
                C: 'Множитель критического урона; без крита равен 1.',
                A: 'Остальные действующие множители атаки.',
                ...round,
            }),
        ],
        notes: [ordinaryAttack],
    },
    'magic.spark_range': {
        formulas: [
            chanceFormula('Дальность Искры, пиксели', 'R + W', {
                R: 'Исходная дальность Искры в мировых пикселях.',
                W: 'Ширина клетки текущей карты в мировых пикселях.',
            }),
        ],
        notes: ['Препятствия, направление и границы коридора по-прежнему проверяются сервером.'],
    },
    'magic.spark_economy': {
        formulas: [chanceFormula('Цена Искры, MP', '6 − 1 = 5')],
        notes: ['Цена энергии не меняется.'],
    },
    'magic.barrier_strength': {
        formulas: [
            chanceFormula('Поглощение одного попадания', 'min(D, M / 0.8)', {
                D: 'Входящий урон до Барьера.',
                M: 'Текущий запас маны.',
            }),
        ],
        notes: [
            'Без звезды Барьер расходует 1 MP за единицу урона. Пока он активен, мана не восстанавливается.',
        ],
    },
    'magic.barrier_duration': {
        formulas: [chanceFormula('Длительность Барьера, мс', '5000 + 1000 = 6000')],
        notes: ['Барьер заканчивается раньше, если мана исчерпана.'],
    },
    'magic.fire_damage': {
        formulas: [
            chanceFormula('Рассчитанный урон взрыва', 'round(B × 1.10)', {
                B: 'Случайный базовый урон Огненной стрелы или Большого огненного шара.',
                ...round,
            }),
        ],
        notes: ['Бонус применяется к урону взрыва. Отдельного броска на крит и уклонение нет.'],
    },
    'magic.chains': {
        formulas: [
            chanceFormula(
                'Расход маны за поддержание Оков',
                `${MAGIC_ABILITY_RULES.chains.drainManaPerSecond} × T × K`,
                {
                    T: 'Длительность поддержания в секундах.',
                    K: 'Множитель стоимости от Контроля маны.',
                }
            ),
        ],
        notes: ['Цена запуска списывается отдельно. Во время канала мана не восстанавливается.'],
    },
    'magic.chains_duration': {
        formulas: [chanceFormula('Максимальная длительность, мс', '10000')],
    },
    'magic.chains_party': {
        formulas: [chanceFormula('Шанс свободного движения живого участника отряда', '100%')],
        notes: ['Исключение касается ваших Оков. Маг стоит на месте, пока их поддерживает.'],
    },
    'magic.blink': {
        formulas: [
            chanceFormula(
                'Максимальная длина скачка',
                `${MAGIC_ABILITY_RULES.blink.rangeTiles} × W`,
                {
                    W: 'Ширина клетки в мировых пикселях.',
                }
            ),
        ],
    },
    'magic.dispel_magic': {
        formulas: [
            chanceFormula(
                'Радиус рассеивания',
                `${MAGIC_ABILITY_RULES.dispel_magic.radiusTiles} × W`,
                {
                    W: 'Ширина клетки в мировых пикселях.',
                }
            ),
        ],
    },
    'magic.city_portal': {
        formulas: [
            chanceFormula('Цена Портала до округления', `${CITY_PORTAL_MANA_FRACTION} × M × K`, {
                M: 'Максимальный запас маны мага.',
                K: 'Множитель стоимости от Контроля маны.',
            }),
        ],
        notes: ['Цена округляется вверх и оплачивается при открытии портала.'],
    },
    ...Object.fromEntries(
        [1, 2, 3].flatMap((rank) => [
            [
                `magic.spell_economy${rank}`,
                {
                    formulas: [
                        chanceFormula(
                            'Множитель расхода маны заклинаний',
                            String(spellManaMultipliers[rank])
                        ),
                    ],
                    notes: [
                        'Действует высшая ступень. Разовые цены округляются вверх. Цена поглощения урона Барьером определяется отдельно.',
                    ],
                },
            ],
            [
                `magic.mana_rest${rank}`,
                {
                    formulas: [
                        chanceFormula(
                            'Множитель восстановления маны в покое',
                            String(manaRestMultipliers[rank])
                        ),
                    ],
                    notes: ['Действует высшая ступень при стоянии вне боя.'],
                },
            ],
        ])
    ),
}
