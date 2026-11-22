import { ITEM_DEFINITIONS, MOVEMENT_RULES } from '@my-game-ratata/contracts'

import { resolveConstellationBonuses } from '../../../../backend/src/game/constellationBonuses'
import type { ConstellationStar } from '../../../../backend/src/game/constellationCatalog'
import type { ConstellationBuildSummary } from './constellationBuildSummary'

const number = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 5 }).format(value)
const row = (label: string, value: string) => ({ label, value })
const percent = (value: number) => `${number(value * 100)}%`
type Bonuses = ReturnType<typeof resolveConstellationBonuses>
type Rows = ConstellationBuildSummary['rows']
type Builder = (bonuses: Bonuses) => Rows
const additive = (label: string, value: number) => [row(label, `+${percent(value)}`)]
const reduction = (label: string, value: number) => [row(label, `−${percent(value)}`)]
const contributions: Record<string, Builder> = {
    'blade.damage1': (b) => additive('Усиление урона мечом', b.swordDamageMultiplier - 1),
    'blade.damage2': (b) => additive('Усиление урона мечом', b.swordDamageMultiplier - 1),
    'blade.economy': (b) => reduction('Расход энергии удара мечом', 1 - b.swordEnergyMultiplier),
    'blade.tempo': (b) =>
        reduction('Интервал, подготовка и блокировка удара мечом', 1 - b.swordTempoMultiplier),
    'blade.critical': (b) => [
        row('Бонус крита удара мечом', `+${number(b.swordCritBonus * 100)} п.п.`),
    ],
    'blade.dodge': (b) => [
        row('Бонус уклонения с исправным мечом', `+${number(b.swordDodgeBonus * 100)} п.п.`),
    ],
    'blade.resolve': (b) =>
        reduction('Длительность нового оглушения', 1 - b.stunDurationMultiplier),
    'magic.spark_damage': (b) => additive('Усиление урона Искры', b.sparkDamageMultiplier - 1),
    'magic.spark_range': (b) => [row('Добавка к дальности Искры', `+${b.sparkRangeCells} клетка`)],
    'magic.spark_economy': (b) => [row('Расход маны Искры', `−${b.sparkManaDiscount} MP`)],
    'magic.barrier_strength': (b) => [
        row('Расход Барьера за единицу поглощённого урона', `${number(b.barrierManaPerDamage)} MP`),
    ],
    'magic.barrier_duration': (b) => [
        row('Добавка к длительности Барьера', `+${b.barrierDurationBonus} мс`),
    ],
    'magic.fire_damage': (b) => additive('Усиление урона взрывов', b.fireDamageMultiplier - 1),
    'magic.chains_duration': (b) => [
        row('Максимальная длительность Оков', `${number(b.chainsDurationMs / 1000)} с`),
    ],
    'magic.chains_party': () => [row('Живые участники отряда', 'Могут перемещаться')],
    ...Object.fromEntries(
        [1, 2, 3].flatMap((rank): Array<[string, Builder]> => [
            [
                `magic.spell_economy${rank}`,
                (b) => reduction('Расход маны заклинаний', 1 - b.spellManaMultiplier),
            ],
            [
                `magic.mana_rest${rank}`,
                (b) => additive('Восстановление маны в покое', b.manaRestMultiplier - 1),
            ],
        ])
    ),
    'arrow.damage1': (b) =>
        additive('Усиление урона Быстрого выстрела', b.shotDamageMultiplier - 1),
    'arrow.damage2': (b) =>
        additive('Усиление урона Быстрого выстрела', b.shotDamageMultiplier - 1),
    'arrow.range1': (b) => [
        row('Добавка к дальности Быстрого выстрела', `+${b.shotRangeCells} клетка`),
    ],
    'arrow.range2': (b) => [
        row('Добавка к дальности Быстрого выстрела', `+${b.shotRangeCells} клетка`),
    ],
    'arrow.economy': (b) => [
        row('Расход энергии Быстрого выстрела', `−${b.shotEnergyDiscount} EN`),
    ],
    'arrow.tempo': (b) => reduction('Интервал Быстрого выстрела', 1 - b.shotTempoMultiplier),
    'arrow.critical': (b) => [
        row('Бонус критического шанса Быстрого выстрела', `+${number(b.shotCritBonus * 100)} п.п.`),
    ],
    'life.move': (b) => additive('Усиление скорости движения', b.moveSpeedMultiplier - 1),
    'life.dash': (b) => reduction('Расход энергии рывка', 1 - b.dashEnergyMultiplier),
    'life.ration': (b) => [
        row(
            'Лечение дорожной едой',
            `до ${number((ITEM_DEFINITIONS.food.healHp ?? 0) + b.foodHealingBonus)} HP`
        ),
    ],
    'life.tread': (b) => reduction('Износ обуви при ходьбе', 1 - b.walkingBootWearMultiplier),
    'life.long_dash': (b) => [
        row('Длительность рывка', `${MOVEMENT_RULES.dashDurationMs + b.dashDurationBonus} мс`),
    ],
    'life.breath': (b) => [
        ...additive('Восстановление энергии при ходьбе', b.walkingEnergyRegenMultiplier - 1),
        ...additive('Восстановление энергии на месте', b.idleEnergyRegenMultiplier - 1),
    ],
    'life.endurance': (b) => additive('Максимальный запас энергии', b.energyCapacityMultiplier - 1),
    'life.rest': (b) =>
        additive('Дополнительное восстановление энергии на месте', b.restEnergyRegenBonus),
    'life.work': (b) => reduction('Расход энергии на полевые работы', 1 - b.workEnergyMultiplier),
    'shadow.speed': (b) => additive('Усиление скорости крадучись', b.sneakSpeedMultiplier - 1),
    'shadow.noise1': (b) => reduction('Шум движения крадучись', 1 - b.sneakNoiseMultiplier),
    'shadow.noise2': (b) => reduction('Шум движения крадучись', 1 - b.sneakNoiseMultiplier),
    'shadow.sight': (b) =>
        reduction('Дистанция обнаружения крадущегося', 1 - b.sneakSightMultiplier),
    'shadow.economy': (b) => [row('Расход энергии кражи', `−${b.theftEnergyDiscount} EN`)],
    'shadow.luck1': (b) => [
        row(
            'Бонус получения предмета при незамеченности',
            `+${number(b.theftChanceBonus * 100)} п.п.`
        ),
    ],
    'shadow.luck2': (b) => [
        row(
            'Бонус получения предмета при незамеченности',
            `+${number(b.theftChanceBonus * 100)} п.п.`
        ),
    ],
    'shadow.tempo': (b) => [row('Общий кулдаун кражи', `−${b.theftCooldownDiscount} мс`)],
    'magic.runic_echo': () => [
        row('Усиление следующего Быстрого выстрела', '+10%'),
        row('Время на Быстрый выстрел', '5000 мс'),
    ],
}
const knowledge: Record<string, Rows> = {
    'blade.insight1': attackKnowledge('обычного удара', false),
    'blade.insight2': attackKnowledge('обычного удара', true),
    'arrow.insight1': attackKnowledge('обоих выстрелов', false),
    'arrow.insight2': attackKnowledge('обоих выстрелов', true),
    'magic.insight': attackKnowledge('изученных заклинаний', true),
    ...resourceKnowledge('magic.mana', 'маны', [25, 10, null]),
    ...resourceKnowledge('life.energy', 'энергии', [25, 10, null]),
    ...healthKnowledge(),
}

/** Resolve one authored contribution, even when later or unrelated stars are selected. */
export function describePassiveConstellationBuild(
    node: Readonly<ConstellationStar>
): Pick<ConstellationBuildSummary, 'rows' | 'effects'> {
    if (node.effectType !== 'passive') throw new Error(`Not a passive star: ${node.id}`)
    if (['blade', 'arrow'].includes(node.constellationId) && node.results?.length)
        return {
            rows: node.results.map((value, index) => row(`Результат ${index + 1}`, value)),
            effects: [node.description],
        }
    if (node.kind === 'root')
        return {
            rows: [row('Дополнительный численный эффект', 'Нет')],
            effects: [node.description],
        }
    const rows =
        knowledge[node.id] ??
        contributions[node.id]?.(resolveConstellationBonuses(new Set([node.id])))
    if (rows === undefined) throw new Error(`Missing passive result: ${node.id}`)
    return { rows: rows.map((entry) => ({ ...entry })), effects: [node.description] }
}
function attackKnowledge(target: string, exact: boolean): Rows {
    return [
        row(`Оценка урона ${target}`, exact ? 'точно' : 'шаг 2'),
        row(`Оценка интервала ${target}`, exact ? 'точно' : 'шаг 100 мс'),
        row(`Оценка крита ${target}`, exact ? 'точно' : 'шаг 2 п.п.'),
    ]
}
function resourceKnowledge(prefix: string, resource: string, steps: Array<number | null>) {
    return Object.fromEntries(
        steps.map((step, index) => [
            `${prefix}${index + 1}`,
            [
                row(
                    `Оценка текущей и максимальной ${resource}`,
                    step === null ? 'точно' : `шаг ${step}`
                ),
            ],
        ])
    )
}
function healthKnowledge() {
    return Object.fromEntries(
        [25, 10, 5, null].map((step, index) => [
            `life.hp${index + 1}`,
            [
                row(
                    'Оценка текущего и максимального здоровья',
                    step === null ? 'точно' : `шаг ${step}`
                ),
                row(
                    'Оценка скорости',
                    step === null ? 'точно' : `шаг ${number([0.5, 0.25, 0.125][index]!)} клетки/с`
                ),
                row(
                    'Оценка уклонения',
                    step === null ? 'точно' : `шаг ${number([2, 1, 0.5][index]!)} п.п.`
                ),
            ],
        ])
    )
}
