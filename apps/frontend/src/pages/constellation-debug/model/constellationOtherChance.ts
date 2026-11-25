import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'

import type { ConstellationStar } from '../../../../../backend/src/game/constellationCatalog'
import { UNDEAD_ARROW_CATCH_CHANCE } from '../../../../../backend/src/game/constellationUndeadTacticsStars'
import { describeBladeEffectChance } from './constellationBladeChance'
import { chanceFormula, withChanceFormulas } from './constellationChanceFormula'
import { chancePercent, criticalChance } from './constellationChanceMath'
import type { ConstellationEffectChance } from './constellationChanceTypes'
import { describeDeterministicOtherChance } from './constellationOtherChanceDetails'
import { describeOtherRootChance } from './constellationOtherChanceRoots'
import { describeStealthTheftChance } from './constellationStealthChance'

const specialDescriptions: Record<string, () => ConstellationEffectChance> = {
    'magic.root': () => describeOtherRootChance('magic.root'),
    'arrow.root': () => describeOtherRootChance('arrow.root'),
    'life.root': () => describeOtherRootChance('life.root'),
    'arrow.critical': describeArrowCritical,
    'arrow.sniper_shot': describeSniperChance,
    'magic.fireball': () => describeFireball('magic.fireball'),
    'magic.greater_fireball': () => describeFireball('magic.greater_fireball'),
    'magic.runic_echo': describeRunicEcho,
    'undead.arrow_catch': describeArrowCatch,
}

function describeArrowCatch(): ConstellationEffectChance {
    return withChanceFormulas(
        {
            summary: 'Стрела может застрять в рёбрах после успешного попадания.',
            examples: [
                {
                    label: 'Доступное срабатывание',
                    value: chancePercent(UNDEAD_ARROW_CATCH_CHANCE),
                },
            ],
            notes: [
                'Перерыв между срабатываниями длится четыре секунды.',
                'Следующее ближнее попадание по врагу за эти четыре секунды получает +20% урона.',
            ],
        },
        [
            chanceFormula(
                'Шанс срабатывания при доступном эффекте',
                chancePercent(UNDEAD_ARROW_CATCH_CHANCE)
            ),
        ]
    )
}
const targetDodge = 'Итоговое уклонение цели в процентах.'
const baseCritical =
    'Базовый критический шанс атакующего в процентах; экипировка сейчас не добавляет крит.'

/** Explanations of resolved effects, deliberately separate from acquiring a star. */
export function describeOtherEffectChance(
    node: ConstellationStar,
    active?: ReadonlySet<string>
): ConstellationEffectChance {
    if (node.constellationId === 'shadow' || node.constellationId === 'theft') {
        return describeStealthTheftChance(node, active)
    }
    const blade = describeBladeEffectChance(node, active)
    if (blade !== undefined) return blade
    const deterministic = describeDeterministicOtherChance(node.id)
    if (deterministic !== undefined) return deterministic
    const special = specialDescriptions[node.id]
    if (special !== undefined) return special()
    if (
        node.constellationId === 'undead' ||
        (node.constellationId === 'arrow' && node.results?.length)
    )
        return withChanceFormulas(
            {
                deterministic: true,
                summary: 'Эффект изученной звезды применяется при выполнении её условий.',
                examples: [],
                notes: [...(node.results ?? [node.description])],
            },
            [chanceFormula('Применение бонуса при выполнении условий', '100%')]
        )
    throw new Error(`Не описана вероятность эффекта звезды: ${node.id}`)
}

function describeSniperChance(): ConstellationEffectChance {
    return withChanceFormulas(
        {
            summary: 'Снайперский выстрел использует обычную защиту от стрел и бросок крита.',
            examples: [],
            notes: [
                'Прицеливание требует видимой цели. Препятствия и дальность проверяются при выпуске.',
            ],
        },
        [
            chanceFormula('Шанс контакта до Барьера, %', '100 − min(95, D + P)', {
                D: targetDodge,
                P: 'Шанс парирования стрелы в процентах.',
            }),
        ]
    )
}

function describeArrowCritical(): ConstellationEffectChance {
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                'Бонус +3 п.п. применяется всегда при подходящей атаке; критический удар остаётся случайным.',
            examples: [
                {
                    label: 'При исходном критическом шансе 5%',
                    value: `${chancePercent(criticalChance(0.05, 0.03))} после бонуса.`,
                },
                {
                    label: 'При исходном критическом шансе 94%',
                    value: `${chancePercent(criticalChance(0.94, 0.03))}: действует верхний предел.`,
                },
                {
                    label: 'При исходном шансе крита 5% и уклонении цели 5%',
                    value: `${chancePercent(0.95 * criticalChance(0.05, 0.03))} критических попаданий до учёта Барьера.`,
                },
            ],
            notes: [
                'Этот бонус действует только на Выстрел и не получает дополнительно бонус крита клинка.',
                'Геометрия и доступность цели проверяются заранее. Барьер может поглотить даже критическое попадание целиком.',
            ],
        },
        [
            chanceFormula('Шанс крита, %', 'min(95, C + 3)', { C: baseCritical }),
            chanceFormula('Шанс критического попадания до Барьера, %', '(1 − D / 100) × C', {
                D: targetDodge,
                C: 'Итоговый шанс крита после бонуса и ограничения, в процентах.',
            }),
        ]
    )
}

function describeFireball(id: string): ConstellationEffectChance {
    const definition =
        ABILITY_DEFINITIONS[id === 'magic.greater_fireball' ? 'greater_fireball' : 'fireball']
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                '100% попадания по тем, кого накрыл взрыв без преграды. Отдельных бросков на уклонение и крит нет.',
            examples: [],
            notes: [
                'Сервер проверяет изучение заклинания, дальность и видимость точки, ману и возможность действовать. Стена между взрывом и целью защищает от урона.',
            ],
        },
        [
            chanceFormula('Границы урона взрыва', '[round(L × K); round(H × K)]', {
                L: `Нижняя базовая граница урона: ${definition.damage ?? 0}.`,
                H: `Верхняя базовая граница урона: ${definition.maxDamage ?? 0}.`,
                K: 'Множитель «Жара»: 1.10 при изученной звезде, иначе 1.',
                round: 'Округление до ближайшего целого.',
            }),
            chanceFormula('Потеря здоровья цели', 'min(H, max(0, D − B))', {
                H: 'Текущее здоровье цели до попадания.',
                D: 'Рассчитанный урон.',
                B: 'Поглощённая Барьером часть урона.',
            }),
        ]
    )
}

function describeRunicEcho(): ConstellationEffectChance {
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                '100%: полезное попадание боевым заклинанием даёт один заряд; дополнительного броска на усиление нет.',
            examples: [
                {
                    label: 'Полезное заклинание попало в 1000 мс, выстрел начат в 5999 мс',
                    value: 'Усиление действует: ×1,10.',
                },
                {
                    label: 'То же попадание в 1000 мс, выстрел начат в 6000 мс',
                    value: 'Усиление уже истекло.',
                },
            ],
            notes: [
                'Заряд расходуется при запуске оплаченного Быстрого выстрела, даже если затем случится промах или уклонение. Новое полезное заклинание обновляет время, но не складывает заряды.',
                'Множитель активного заряда применяется перед итоговым округлением урона. Усиленный выстрел может быть направлен в другую допустимую цель. Уклонение, крит и поглощение Барьером остаются отдельными проверками.',
                'Не путайте с открытием звезды: там нужны два полезных попадания по одной цели за ≤5000 мс включительно; здесь конец действия заряда строгий.',
            ],
        },
        [
            chanceFormula('Условие активности заряда, мс', 't < t₀ + 5000', {
                t: 'Время запуска оплаченного Быстрого выстрела.',
                't₀': 'Время последнего полезного попадания боевым заклинанием.',
            }),
            chanceFormula('Множитель урона Быстрого выстрела при активном заряде', '1.10'),
        ]
    )
}
