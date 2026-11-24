import {
    ABILITY_DEFINITIONS,
    ASH_RITE_RULES,
    ASH_RULES,
    type DeityMood,
    resolveAshParameters,
    resolveResurrectionParameters,
    RESURRECTION_SUCCESS_CAP,
} from '@my-game-ratata/contracts'

import type { ConstellationStar } from '../../../../backend/src/game/constellationCatalog'
import { prayerAnswerChance } from '../../../../backend/src/game/prayerProbability'
import { chanceFormula, withChanceFormulas } from './constellationChanceFormula'
import { chancePercent } from './constellationChanceMath'
import type { ConstellationChanceFormula } from './constellationChanceTypes'
import { prayerChanceExamples } from './constellationPrayerChanceExamples'
import * as math from './constellationPrayerFormulas'
import { prayerSchoolInfo } from './constellationPrayerScenario'

const path = 'prayer_grave.'
const info = prayerSchoolInfo.pray_grave
const baseMood = '80 при благосклонности; 55 при нейтральном настроении; 25 при гневе.'
const quality = '1,3 при благосклонности; 1 при нейтральном настроении; 0,65 при гневе.'
const cap = RESURRECTION_SUCCESS_CAP * 100
const ashDefinition = ABILITY_DEFINITIONS.pray_grave
const ashMoods: ReadonlyArray<readonly [DeityMood, string]> = [
    ['benevolent', 'Благосклонность'],
    ['neutral', 'Нейтральное настроение'],
    ['wrathful', 'Гнев'],
]

function decimal(value: number): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, useGrouping: false }).format(
        value
    )
}

function examples(roll: (mood: DeityMood) => number, prefix: string) {
    return ashMoods.map(([mood, label]) => ({
        label: `${prefix} · ${label}`,
        value: `Успех ${chancePercent(roll(mood))}.`,
    }))
}

function cappedAshChance(label: string, bonus: number): ConstellationChanceFormula {
    return chanceFormula(label, bonus === 0 ? 'B' : `min(${cap}, B + ${decimal(bonus * 100)})`, {
        B: baseMood,
    })
}

function rollUnder(label: string) {
    return chanceFormula('Условие успеха', 'r < P / 100', {
        r: 'Один общий случайный бросок завершённой молитвы от 0 включительно до 1 не включительно.',
        P: `${label} в процентах с учётом доступных усилений и настроения.`,
    })
}

export function describeAshEffectChance(node: ConstellationStar, activeIds?: ReadonlySet<string>) {
    const selection = node.effectType === 'passive' ? new Set([node.id]) : (activeIds ?? new Set())
    if (node.id === `${path}root`) return describeHealing(selection)
    if (node.id === `${path}revive`) return describeRevival(selection)
    if (node.id === `${path}brand`) return describeBrand()
    if (node.id.startsWith(`${path}exhaustion`)) return describeExhaustion(selection)
    return describeGuaranteedAsh(node, selection)
}

function describeExhaustion(activeIds: ReadonlySet<string>) {
    const { chanceBonus, drain, durationMs, reductions } = ASH_RULES.exhaustion
    const rank = resolveAshParameters(activeIds).exhaustionRank || 1
    return withChanceFormulas(
        {
            summary:
                'Попадание истощает ресурсы. Ответ Хранителя Праха дополнительно снижает их максимумы.',
            examples: examples((mood) => prayerAnswerChance(mood) + chanceBonus, 'Проклятие'),
            notes: [
                'Бросок на проклятие происходит при попадании. Мгновенное истощение от броска не зависит.',
            ],
        },
        [
            chanceFormula('Шанс проклятия, %', `B + ${decimal(chanceBonus * 100)}`, {
                B: baseMood,
            }),
            chanceFormula('Мгновенное истощение каждого ресурса', String(drain)),
            chanceFormula('Снижение максимумов, %', decimal(reductions[rank - 1]! * 100)),
            chanceFormula('Срок проклятия, мин', String(durationMs / 60_000)),
        ]
    )
}

function describeHealing(activeIds: ReadonlySet<string>) {
    const ash = resolveAshParameters(activeIds)
    const revival = activeIds.has(`${path}revive`) ? describeRevival(activeIds) : undefined
    return withChanceFormulas(
        {
            summary:
                'Хранитель Праха может исцелить раненого союзника из нежити. Шанс ответа зависит от настроения и изученных усилений.',
            examples: [
                ...examples(
                    (mood) =>
                        Math.min(
                            RESURRECTION_SUCCESS_CAP,
                            prayerAnswerChance(mood) + ash.healChanceBonus
                        ),
                    info.masteryName
                ),
                ...(revival?.examples ?? []),
            ],
            notes: [
                'Доступная раненая цель должна быть рядом в прямой видимости. Некромант может исцелить себя, если относится к нежити.',
                'Если изучено лечение второй цели, один бросок применяется к обеим. Вторая цель требует дополнительной маны.',
                'Нужен ответ Хранителя Праха. Школа выбирает своего покровителя независимо от выбора в интерфейсе.',
                ...(revival?.notes ?? []),
            ],
        },
        [
            cappedAshChance('Шанс лечения нежити, %', ash.healChanceBonus),
            rollUnder('Шанс лечения нежити'),
            chanceFormula('Лечение при ответе, HP', `min(N, round(${info.basePower} × Q × M))`, {
                N: 'Недостающее здоровье цели.',
                Q: quality,
                M: `Множитель лечения по изученным звёздам Праха. В этой конфигурации ${decimal(ash.healPower)}.`,
            }),
            ...(revival?.formulaDetails ?? []),
        ]
    )
}

function describeRevival(activeIds: ReadonlySet<string>) {
    const ash = resolveAshParameters(activeIds)
    const parameters = resolveResurrectionParameters('pray_grave', activeIds, 'neutral')
    return withChanceFormulas(
        {
            summary:
                'Хранитель Праха может вернуть выбранного павшего союзника из нежити, пока его душа доступна.',
            examples: examples(
                (mood) =>
                    resolveResurrectionParameters('pray_grave', activeIds, mood).successChance,
                'Возвращение праха'
            ),
            notes: [
                'Павший союзник должен быть в той же локации, в пределах дальности и прямой видимости. Временные прислужники исключены.',
                'Обряд возвращает ту же личность. Время возврата принадлежит серверу, а лечебные усиления действуют только на лечение.',
            ],
        },
        [
            cappedAshChance('Шанс воскрешения, %', ash.reviveChanceBonus),
            rollUnder('Шанс воскрешения'),
            math.prayerRevivalHpFormula(parameters.hpFraction),
            math.prayerRevivalResourceFormula(
                parameters.resourceFraction,
                parameters.minimumResource
            ),
        ]
    )
}

function describeBrand() {
    return withChanceFormulas(
        {
            summary:
                'Пепельная печать поражает одну выбранную видимую враждебную цель с вероятностью ответа Хранителя Праха.',
            examples: prayerChanceExamples('Пепельная печать'),
            notes: [
                'Проверяются враждебность, дальность и видимость. Тип существа цели порог ответа не меняет.',
                'Усиления лечения или воскрешения не повышают шанс Печати.',
            ],
        },
        [
            cappedAshChance('Шанс Пепельной печати, %', 0),
            rollUnder('Шанс Пепельной печати'),
            chanceFormula('Нечестивый урон до защиты', `round(${ASH_RULES.brandDamage} × Q)`, {
                Q: quality,
            }),
            chanceFormula('Подготовка Печати, мс', String(ASH_RULES.brandWindupMs)),
            chanceFormula('Откат Печати, мс', String(ASH_RULES.brandCooldownMs)),
        ]
    )
}

function describeGuaranteedAsh(node: ConstellationStar, activeIds: ReadonlySet<string>) {
    const ash = resolveAshParameters(activeIds)
    const id = node.id.slice(path.length)
    const details = [...ashModifierFormulas(id, ash), ...ashRiteFormulas(id, ash)]
    return withChanceFormulas(
        {
            deterministic: true,
            summary: node.description,
            examples: [],
            notes: guaranteedAshNotes(id),
        },
        [math.prayerModifierFormula(), ...details]
    )
}

type AshParameters = ReturnType<typeof resolveAshParameters>

function ashModifierFormulas(id: string, ash: AshParameters): ConstellationChanceFormula[] {
    if (id.startsWith('heal_power'))
        return [chanceFormula('Текущий множитель лечения', decimal(ash.healPower))]
    if (id.startsWith('heal_chance'))
        return [cappedAshChance('Текущий шанс лечения нежити, %', ash.healChanceBonus)]
    if (id.startsWith('heal_radius'))
        return [radiusFormula('Дальность лечения, px', ash.healRadiusCells)]
    if (id === 'heal_second')
        return [chanceFormula('Доплата за вторую цель, MP', String(ASH_RULES.extraHealMana))]
    if (id.startsWith('revive_chance'))
        return [cappedAshChance('Текущий шанс воскрешения, %', ash.reviveChanceBonus)]
    if (id.startsWith('revive_hp')) return [math.prayerRevivalHpFormula(ash.reviveHpFraction)]
    if (id.startsWith('revive_focus'))
        return [
            chanceFormula(
                'Длительность возвращения, мс',
                String(ashDefinition.windupMs - ash.reviveFasterMs)
            ),
        ]
    if (id === 'revive_radius')
        return [radiusFormula('Дальность возвращения, px', ash.reviveRadiusCells)]
    if (id === 'omen4') return [math.prayerMoodTimerFormula()]
    if (id === 'dash')
        return [
            chanceFormula('Экономия энергии на следующем рывке', String(ASH_RULES.dashDiscount)),
            chanceFormula('Срок скидки, мс', String(ASH_RULES.dashDiscountDurationMs)),
        ]
    if (id === 'mana')
        return [
            chanceFormula('Возвращаемая мана', String(ASH_RULES.manaGift)),
            chanceFormula('Откат дара маны, мс', String(ASH_RULES.manaGiftCooldownMs)),
        ]
    return []
}

function radiusFormula(label: string, cells: number) {
    return chanceFormula(label, `${ashDefinition.range} + ${cells} × W`, {
        W: 'Ширина клетки карты в мировых пикселях.',
    })
}

function ashRiteFormulas(id: string, ash: AshParameters): ConstellationChanceFormula[] {
    if (id === 'raise' || id.startsWith('raise_'))
        return [
            chanceFormula('Подготовка подъёма, мс', String(ash.raiseWindupMs)),
            chanceFormula('Откат подъёма, мс', String(ASH_RULES.raiseCooldownMs)),
            chanceFormula('Цена подъёма, MP', String(ASH_RULES.raiseMana)),
            chanceFormula('Предел прислужников', String(ash.raiseSlots)),
            chanceFormula('Время прислужника, мс', String(ash.raiseDurationMs)),
            chanceFormula('Стартовое здоровье от максимума, %', decimal(ash.raiseHpFraction * 100)),
        ]
    if (id === 'orders')
        return [chanceFormula('Предел приказов', String(ASH_RITE_RULES.orderSlots))]
    if (id === 'tame')
        return [
            chanceFormula(
                'Подготовка приручения, мс',
                String(ABILITY_DEFINITIONS.ash_tame.windupMs)
            ),
            chanceFormula('Цена приручения, MP', String(ABILITY_DEFINITIONS.ash_tame.mana)),
            chanceFormula('Предел постоянных прислужников', String(ASH_RITE_RULES.orderSlots)),
        ]
    if (id === 'donate' || id === 'sacrifice') {
        const deep = id === 'sacrifice'
        return [
            chanceFormula(
                'Передаваемый опыт',
                String(deep ? ASH_RITE_RULES.sacrificeXp : ASH_RITE_RULES.giftXp)
            ),
            chanceFormula(
                'Прибавка к базовому максимуму HP, %',
                decimal((deep ? ASH_RITE_RULES.sacrificeHpBonus : ASH_RITE_RULES.giftHpBonus) * 100)
            ),
        ]
    }
    if (id === 'heart')
        return [
            chanceFormula('Возвращение после гибели, мс', String(ASH_RULES.heartReturnMs)),
            chanceFormula('Оставшийся опыт каждого мастерства', 'floor(X × 0,70)', {
                X: 'Накопленный опыт мастерства в микроединицах до возвращения к сердцу.',
            }),
        ]
    return []
}

function guaranteedAshNotes(id: string): string[] {
    if (id === 'raise' || id.startsWith('raise_'))
        return [
            'Подходящие останки доступны после ухода прежней души. Обряд создаёт нового временного скелета в свободном месте.',
        ]
    if (id === 'orders')
        return [
            'Приказы получает доступный союзный скелет. Бить слаймов он начинает только по отдельной команде.',
        ]
    if (id === 'donate' || id === 'sacrifice')
        return [
            'Цель — живой союзный скелет. Один скелет может получить только один из двух постоянных даров.',
        ]
    if (id === 'heart')
        return [
            'Возвращение требует привязанного сердца в исходном сундуке и свободного места рядом. Обычное воскрешение отменяет ожидание.',
        ]
    if (id === 'dash' || id === 'mana')
        return [
            'Бонус возникает после полезного лечения нежити. Для возврата маны нужен другой союзник.',
        ]
    return []
}
