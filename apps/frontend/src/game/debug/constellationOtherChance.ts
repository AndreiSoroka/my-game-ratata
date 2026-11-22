import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'

import type { ConstellationStar } from '../../../../backend/src/game/constellationCatalog'
import { describeBladeEffectChance } from './constellationBladeChance'
import { chanceFormula, withChanceFormulas } from './constellationChanceFormula'
import { chancePercent, criticalChance, theftEffectChances } from './constellationChanceMath'
import type { ConstellationEffectChance } from './constellationChanceTypes'
import { describeDeterministicOtherChance } from './constellationOtherChanceDetails'
import { describeOtherRootChance } from './constellationOtherChanceRoots'

const specialDescriptions: Record<string, () => ConstellationEffectChance> = {
    'arrow.critical': describeArrowCritical,
    'shadow.root': () => describeTheft('shadow.root'),
    'shadow.luck1': () => describeTheft('shadow.luck1'),
    'shadow.luck2': () => describeTheft('shadow.luck2'),
    'shadow.noise1': describeNoise,
    'shadow.noise2': describeNoise,
    'shadow.sight': describeSight,
    'magic.fireball': () => describeFireball('magic.fireball'),
    'magic.greater_fireball': () => describeFireball('magic.greater_fireball'),
    'magic.runic_echo': describeRunicEcho,
}
const targetDodge = 'Итоговое уклонение цели в процентах.'
const baseCritical =
    'Базовый критический шанс атакующего в процентах; экипировка сейчас не добавляет крит.'
const clamp = 'Ограничение результата нижней и верхней границами — первыми двумя аргументами.'

/** Explanations of resolved effects, deliberately separate from acquiring a star. */
export function describeOtherEffectChance(
    node: ConstellationStar,
    active?: ReadonlySet<string>
): ConstellationEffectChance {
    const blade = describeBladeEffectChance(node, active)
    if (blade !== undefined) return blade
    const deterministic = describeDeterministicOtherChance(node.id)
    if (deterministic !== undefined) return deterministic
    const special = specialDescriptions[node.id]
    if (special !== undefined) return special()
    if (['magic.root', 'arrow.root', 'life.root'].includes(node.id))
        return describeOtherRootChance(node.id)
    if (node.id === 'arrow.sniper_shot') return describeSniperChance()
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

function describeTheft(id: string): ConstellationEffectChance {
    const bonus = id === 'shadow.luck2' ? 0.06 : id === 'shadow.luck1' ? 0.03 : 0
    const behind = theftEffectChances(false, bonus)
    const front = theftEffectChances(true, bonus)
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                bonus === 0
                    ? 'Кража имеет два броска: сначала обнаружение, затем получение предмета, если вас не обнаружили.'
                    : 'Бонус применяется в 100% допустимых попыток, но сама кража остаётся двухэтапной случайной проверкой.',
            examples: [
                {
                    label: 'Сзади',
                    value: `Обнаружение ${chancePercent(behind.detected)}; получение при незамеченности ${chancePercent(behind.success)}; незаметная кража ${chancePercent(behind.unnoticed)}.`,
                },
                {
                    label: 'Спереди',
                    value: `Обнаружение ${chancePercent(front.detected)}; получение при незамеченности ${chancePercent(front.success)}; незаметная кража ${chancePercent(front.unnoticed)}.`,
                },
            ],
            notes: [
                `В примерах бонус удачи — ${bonus * 100} п.п. Одна звезда удачи даёт 3 п.п.; обе вместе — 6 п.п. Бонус добавляется к U, а не к общему исходу, и не уменьшает D.`,
                'Сначала проверяются живая цель, дистанция, видимость, ресурсы, кулдауны, свободное место и существующий доступный предмет. Отвергнутая команда не делает этих бросков.',
            ],
        },
        theftFormulas()
    )
}

function theftFormulas() {
    const outcomes = {
        D: 'Шанс обнаружения в процентах.',
        U: 'Шанс получить предмет при незамеченности, в процентах.',
    }
    return [
        chanceFormula('Шанс обнаружения, %', 'clamp(10, 90, 68 + F)', {
            F: '12 при попытке спереди от цели; −8 в остальных случаях.',
            clamp,
        }),
        chanceFormula(
            'Шанс получить предмет, если не обнаружили, %',
            'clamp(5, 90, 30.5 + A + B)',
            {
                A: '0 спереди от цели; 10 в остальных случаях.',
                B: 'Бонус удачи в процентных пунктах: 0 без звёзд, 3 с одной, 6 с обеими.',
                clamp,
            }
        ),
        chanceFormula('Шанс незаметно украсть, %', '(1 − D / 100) × U', outcomes),
        chanceFormula('Шанс быть пойманным, %', 'D', { D: outcomes.D }),
        chanceFormula('Шанс тихой неудачи, %', '(1 − D / 100) × (100 − U)', outcomes),
    ]
}

function describeNoise(): ConstellationEffectChance {
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                '100%: при настоящих шагах крадучись громкость уменьшается без случайного броска.',
            examples: [],
            notes: [
                'Вместе две звезды тишины уменьшают этот множитель на 30%, не на 27,75%.',
                'Поверхность и препятствия учитываются отдельно. Стояние не создаёт шагов, а рывок использует собственную громкость без этого тихого множителя.',
            ],
        },
        [
            chanceFormula(
                'Радиус шума при движении крадучись, пиксели',
                '64 × M × 0.18 × (1 − 0.15 × N)',
                {
                    M: 'Множитель громкости поверхности.',
                    N: 'Число изученных звёзд тишины: 1 или 2.',
                }
            ),
        ]
    )
}

function describeSight(): ConstellationEffectChance {
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                '100%: радиус обнаружения уменьшается по геометрическим правилам, а не по шансу невидимости.',
            examples: [],
            notes: [
                'Нужно двигаться крадучись, не находиться в рывке и не атаковать в последнюю секунду. Сохраняются проверки прямой видимости; это не гарантирует незаметность.',
            ],
        },
        [
            chanceFormula('Радиус обнаружения цели, пиксели', 'min(R, max(28, R × F × 0.90))', {
                R: 'Исходный радиус зрения наблюдателя в мировых пикселях.',
                F: 'Множитель угла к взгляду наблюдателя: 0.65 спереди, 0.35 сзади, 0.50 сбоку.',
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
