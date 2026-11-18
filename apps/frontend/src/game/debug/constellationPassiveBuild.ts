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
        row('Добавка к поглощению Барьера', `+${b.barrierAbsorptionBonus}`),
    ],
    'magic.barrier_duration': (b) => [
        row('Добавка к длительности Барьера', `+${b.barrierDurationBonus} мс`),
    ],
    'magic.fire_damage': (b) =>
        additive('Усиление урона огненных шаров', b.fireDamageMultiplier - 1),
    'arrow.damage1': (b) => additive('Усиление урона Выстрела', b.shotDamageMultiplier - 1),
    'arrow.damage2': (b) => additive('Усиление урона Выстрела', b.shotDamageMultiplier - 1),
    'arrow.range1': (b) => [row('Добавка к дальности Выстрела', `+${b.shotRangeCells} клетка`)],
    'arrow.range2': (b) => [row('Добавка к дальности Выстрела', `+${b.shotRangeCells} клетка`)],
    'arrow.economy': (b) => [row('Расход энергии Выстрела', `−${b.shotEnergyDiscount} EN`)],
    'arrow.tempo': (b) => reduction('Интервал Выстрела', 1 - b.shotTempoMultiplier),
    'arrow.critical': (b) => [
        row('Бонус критического шанса Выстрела', `+${number(b.shotCritBonus * 100)} п.п.`),
    ],
    'life.move': (b) => additive('Усиление скорости движения', b.moveSpeedMultiplier - 1),
    'life.dash': (b) => reduction('Расход энергии рывка', 1 - b.dashEnergyMultiplier),
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
        row('Усиление следующего Выстрела', '+10%'),
        row('Время на Выстрел', '5000 мс'),
    ],
}
const knowledge: Record<string, Rows> = {
    'blade.insight1': attackKnowledge('обычного удара', false),
    'blade.insight2': attackKnowledge('обычного удара', true),
    'arrow.insight1': attackKnowledge('Выстрела', false),
    'arrow.insight2': attackKnowledge('Выстрела', true),
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
    if (node.constellationId === 'blade' && node.results?.length)
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
