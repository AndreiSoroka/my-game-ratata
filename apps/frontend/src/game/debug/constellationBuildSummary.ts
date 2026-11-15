import {
    ABILITY_DEFINITIONS,
    BARRIER_RULES,
    type ConstellationId,
    MOVEMENT_RULES,
    SURFACE_NOISE_MULTIPLIERS,
    THEFT_RULES,
} from '@my-game-ratata/contracts'

import { resolveConstellationBonuses } from '../../../../backend/src/game/constellationBonuses'
import { chancePercent, theftEffectChances } from './constellationChanceMath'

export interface ConstellationBuildSummary {
    rows: Array<{ label: string; value: string }>
    effects?: string[]
}
export interface ConstellationBuildOptions {
    runicCharged?: boolean
    tileWidth?: number
}
type Bonuses = ReturnType<typeof resolveConstellationBonuses>
interface Context {
    active: ReadonlySet<string>
    bonuses: Bonuses
    options: ConstellationBuildOptions
    runicMultiplier: number
}
const number = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 5 }).format(value)
const multiplier = (value: number) => `×${number(value)}`
const row = (label: string, value: string | number) => ({ label, value: String(value) })
const points = (value: number) => `+${number(value * 100)} п.п.`
const builders = new Map<ConstellationId, (context: Context) => ConstellationBuildSummary>([
    ['blade', blade],
    ['magic', magic],
    ['arrow', arrow],
    ['life', life],
    ['shadow', shadow],
])

/** Selected-star totals only: no actor resources, equipment, skill levels or recovery are simulated. */
export function describeConstellationBuild(
    path: ConstellationId,
    activeIds: ReadonlySet<string>,
    options: ConstellationBuildOptions = {}
): ConstellationBuildSummary {
    const context: Context = {
        active: activeIds,
        bonuses: resolveConstellationBonuses(activeIds),
        options,
        runicMultiplier:
            activeIds.has('magic.runic_echo') && options.runicCharged === true ? 1.1 : 1,
    }
    const builder = builders.get(path)
    if (builder === undefined) return { rows: [] }
    const build = builder(context)
    return {
        ...build,
        rows: [
            row('Корень созвездия', activeIds.has(`${path}.root`) ? 'выбран' : 'не выбран'),
            ...build.rows,
        ],
    }
}

function blade({ active, bonuses: b }: Context): ConstellationBuildSummary {
    return {
        rows: [
            row('Урон обычного удара исправным мечом', multiplier(b.swordDamageMultiplier)),
            row('Цена обычного удара исправным мечом', multiplier(b.swordEnergyMultiplier)),
            row(
                'Интервал, подготовка и блокировка удара мечом',
                multiplier(b.swordTempoMultiplier)
            ),
            row('Бонус крита обычного удара исправным мечом', points(b.swordCritBonus)),
            row('Бонус уклонения с исправным мечом', points(b.swordDodgeBonus)),
            row('Длительность нового оглушения', multiplier(b.stunDurationMultiplier)),
            row('Знание обычного удара', attackKnowledge(rank(active, 'blade.insight', 2))),
        ],
        effects: [
            'Бонусы меча действуют только с исправным simple_sword или old_sword. Сокращение нового оглушения не требует меча.',
            'Итоговые крит и уклонение ограничены 95%. Сводка показывает добавку, поскольку базовые характеристики и экипировка здесь не заданы.',
            'Ослабленный удар сохраняет собственные правила расхода и замедления; попадание и поглощение Барьером проверяются отдельно.',
        ],
    }
}

function magic(context: Context): ConstellationBuildSummary {
    const { active, bonuses: b, options } = context
    return {
        rows: [
            row('Урон Искры', multiplier(b.sparkDamageMultiplier)),
            row(
                'Дальность Искры',
                range(ABILITY_DEFINITIONS.spark.range, b.sparkRangeCells, options.tileWidth)
            ),
            row('Цена Искры, MP', ABILITY_DEFINITIONS.spark.mana - b.sparkManaDiscount),
            row('Цена Искры, EN', ABILITY_DEFINITIONS.spark.energy),
            row('Запас поглощения Барьера', BARRIER_RULES.absorption + b.barrierAbsorptionBonus),
            row('Длительность Барьера, мс', BARRIER_RULES.durationMs + b.barrierDurationBonus),
            row('Огненный шар', active.has('magic.fireball') ? 'выбран' : 'не выбран'),
            row(
                'Большой огненный шар',
                active.has('magic.greater_fireball') ? 'выбран' : 'не выбран'
            ),
            row('Урон огненных шаров', multiplier(b.fireDamageMultiplier)),
            row('Знание маны', precision([50, 25, 10, null][rank(active, 'magic.mana', 3)])),
            row(
                'Знание изученных заклинаний',
                active.has('magic.insight') ? 'точные урон, интервал и крит' : attackKnowledge(0)
            ),
            row('Руническое эхо', echoState(context)),
            row(
                'Урон Выстрела с учётом всей сборки',
                multiplier(b.shotDamageMultiplier * context.runicMultiplier)
            ),
        ],
        effects: [
            'Уровни навыков не заданы: урон указан множителем к соответствующей базе, а не вымышленным конечным числом.',
            'Рунический заряд учитывается только при выбранном «Руническом эхе». Он расходуется при начале оплаченного Выстрела, даже при последующем промахе.',
            'Заряд действует строго менее 5 секунд после полезного попадания заклинанием. Здесь переключатель моделирует только наличие заряда.',
        ],
    }
}

function arrow(context: Context): ConstellationBuildSummary {
    const { active, bonuses: b, options, runicMultiplier } = context
    return {
        rows: [
            row('Урон Выстрела от звёзд Стрелы', multiplier(b.shotDamageMultiplier)),
            row('Руническое эхо', echoState(context)),
            row(
                'Итоговый множитель урона Выстрела',
                multiplier(b.shotDamageMultiplier * runicMultiplier)
            ),
            row(
                'Дальность Выстрела',
                range(ABILITY_DEFINITIONS.shot.range, b.shotRangeCells, options.tileWidth)
            ),
            row('Цена Выстрела, EN', ABILITY_DEFINITIONS.shot.energy - b.shotEnergyDiscount),
            row(
                'Кулдаун Выстрела, мс',
                ABILITY_DEFINITIONS.shot.cooldownMs * b.shotTempoMultiplier
            ),
            row('Бонус критического шанса Выстрела', points(b.shotCritBonus)),
            row('Знание Выстрела', attackKnowledge(rank(active, 'arrow.insight', 2))),
        ],
        effects: [
            'Две звезды урона складываются до +20%. Активный рунический заряд затем умножает этот результат на 1,10; итоговое округление выполняется в бою.',
            'Бонус крита относится только к Выстрелу, ограничивается общим пределом 95% и не получает бонус меча. Уклонение и Барьер учитываются отдельно.',
        ],
    }
}

function life({ active, bonuses: b }: Context): ConstellationBuildSummary {
    const body = rank(active, 'life.hp', 4)
    return {
        rows: [
            row('Скорость ходьбы относительно базовой', multiplier(b.moveSpeedMultiplier)),
            row(
                'Скорость крадучись с учётом Тени',
                multiplier(
                    b.moveSpeedMultiplier *
                        MOVEMENT_RULES.sneakSpeedMultiplier *
                        b.sneakSpeedMultiplier
                )
            ),
            row(
                'Скорость рывка относительно базовой',
                multiplier(b.moveSpeedMultiplier * MOVEMENT_RULES.dashSpeedMultiplier)
            ),
            row('Цена рывка, EN', MOVEMENT_RULES.dashEnergy * b.dashEnergyMultiplier),
            row('Знание текущего и максимального здоровья', precision([50, 25, 10, 5, null][body])),
            row('Знание скорости', precision([1, 0.5, 0.25, 0.125, null][body], 'клетки/с')),
            row('Знание уклонения', precision([5, 2, 1, 0.5, null][body], 'п.п.')),
            row(
                'Знание текущей и максимальной энергии',
                precision([50, 25, 10, null][rank(active, 'life.energy', 3)])
            ),
        ],
        effects: [
            'Множители скорости указаны к исходной скорости персонажа, а не к фактическому перемещению сквозь препятствия.',
            'Знание меняет точность отображения собственных показателей. Оно не прибавляет здоровье, энергию, уклонение или лечение.',
        ],
    }
}

function shadow({ bonuses: b }: Context): ConstellationBuildSummary {
    const example = theftEffectChances(false, b.theftChanceBonus)
    return {
        rows: [
            row(
                'Скорость крадучись с учётом Жизни',
                multiplier(
                    b.moveSpeedMultiplier *
                        MOVEMENT_RULES.sneakSpeedMultiplier *
                        b.sneakSpeedMultiplier
                )
            ),
            row('Множитель радиуса шума от звёзд тишины', multiplier(b.sneakNoiseMultiplier)),
            row(
                'Радиус шума: трава, пиксели',
                number(
                    MOVEMENT_RULES.walkingNoiseRadius *
                        SURFACE_NOISE_MULTIPLIERS.grass *
                        MOVEMENT_RULES.sneakNoiseMultiplier *
                        b.sneakNoiseMultiplier
                )
            ),
            row('Множитель радиуса обнаружения от звезды Тени', multiplier(b.sneakSightMultiplier)),
            row('Цена попытки кражи, EN', THEFT_RULES.energyCost - b.theftEnergyDiscount),
            row('Общий кулдаун кражи, мс', THEFT_RULES.cooldownMs - b.theftCooldownDiscount),
            row('Повторная кража у той же цели, мс', THEFT_RULES.pairCooldownMs),
            row('Добавка к успеху кражи при незамеченности', points(b.theftChanceBonus)),
            row('Сзади: обнаружение', chancePercent(example.detected)),
            row('Сзади: получение при незамеченности', chancePercent(example.success)),
            row('Сзади: незаметная кража', chancePercent(example.unnoticed)),
        ],
        effects: [
            'Мастерство Тени открывает звёзды. Базовые вероятность кражи и геометрия скрытности от его уровня не растут.',
            'Фактический шум дополнительно зависит от поверхности и изученных звёзд. Обнаружение использует расстояние, направление взгляда, прямую видимость и границу 28 пикселей; случайной невидимости нет.',
            'Удача прибавляется к условному получению предмета и не снижает обнаружение. Для кражи сохраняются обычные проверки цели, карманов, ресурсов и кулдаунов.',
        ],
    }
}

function range(base: number, cells: number, tileWidth: number | undefined): string {
    if (cells === 0) return `${number(base)} px`
    if (tileWidth !== undefined && Number.isFinite(tileWidth) && tileWidth > 0)
        return `${number(base + cells * tileWidth)} px`
    return `${number(base)} px + ${number(cells)} кл.`
}
function rank(active: ReadonlySet<string>, prefix: string, maximum: number): number {
    for (let value = maximum; value > 0; value -= 1) {
        if (active.has(`${prefix}${value}`)) return value
    }
    return 0
}
function precision(step: number | null | undefined, unit = ''): string {
    return step === null || step === undefined
        ? 'точно'
        : `шаг ${number(step)}${unit === '' ? '' : ` ${unit}`}`
}
function attackKnowledge(level: number): string {
    if (level === 2) return 'точные урон, интервал и крит'
    return level === 1
        ? 'урон: шаг 2; интервал: 100 мс; крит: 2 п.п.'
        : 'урон: шаг 5; интервал: 500 мс; крит: 5 п.п.'
}
function echoState({ active, runicMultiplier }: Context): string {
    if (!active.has('magic.runic_echo')) return 'не выбрано'
    return runicMultiplier > 1 ? 'заряд активен, ×1,10' : 'без заряда, ×1'
}
