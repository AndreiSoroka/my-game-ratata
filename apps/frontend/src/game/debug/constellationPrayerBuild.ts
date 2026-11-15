import {
    ABILITY_DEFINITIONS,
    type DeityMood,
    GRAVE_PURIFY_STEPS,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerAbilityId,
    REVIVE_MANA_COST,
} from '@my-game-ratata/contracts'

import { resolveConstellationBonuses } from '../../../../backend/src/game/constellationBonuses'
import { prayerMoodQuality } from '../../../../backend/src/game/prayerProbability'
import { constellationDistance } from './constellationDistance'

export interface PrayerBuildResult {
    available: boolean
    effects: string[]
    metrics: Array<{ label: string; value: string }>
}
export interface PrayerBuildContext {
    ability: PrayerAbilityId
    mood: DeityMood
    lowHealthEligible: boolean
    tileWidth: number
    resource: string
    basePower: number
}
export type PrayerBuildFocus = 'prayer' | 'harm' | 'revival'
export function prayerBuildFocus(nodeId: string): PrayerBuildFocus {
    if (nodeId.startsWith('prayer.harm')) return 'harm'
    return nodeId.endsWith('.revive') ? 'revival' : 'prayer'
}
type Bonuses = ReturnType<typeof resolveConstellationBonuses>
const insights = [
    'Нет',
    'Намёки на настроение',
    'Точное настроение',
    'Настроение и шанс ответа',
    'Настроение, шанс ответа и время смены',
]

/** Resolved example only. Dependency validation belongs to the atlas build state. */
export function calculatePrayerBuild(
    nodeId: string,
    activeIds: ReadonlySet<string>,
    context: PrayerBuildContext
): PrayerBuildResult {
    const root = `${PRAYER_SCHOOL_DEFINITIONS[context.ability].constellationId}.root`
    const focus = prayerBuildFocus(nodeId)
    const revival = focus === 'revival'
    if (!activeIds.has(root) || (focus !== 'prayer' && !activeIds.has(nodeId)))
        return { available: false, effects: [], metrics: [] }
    const bonuses = resolveConstellationBonuses(activeIds, context.lowHealthEligible)
    if (focus === 'harm') {
        const effects: string[] = []
        const metrics = [radiusMetric(context, bonuses)]
        appendHarm(effects, metrics, bonuses, context)
        return { available: true, effects, metrics }
    }
    const mother = context.ability === 'pray'
    const metrics = commonMetrics(context, bonuses, revival)
    if (revival)
        return {
            available: true,
            effects: ['Воскрешение: одна подходящая павшая цель; возвращает половину ресурсов.'],
            metrics: [
                ...metrics,
                {
                    label: 'Ресурсы после воскрешения',
                    value: '50% максимума; HP округляется вверх, минимум 1',
                },
            ],
        }
    metrics.push(...restorationMetrics(context, bonuses))
    const effects = [healingTargets(context.ability, mother && bonuses.prayerArea)]
    if (mother) appendMotherEffects(effects, metrics, activeIds, bonuses, context)
    const reviveId = revivalNode(context.ability)
    if (reviveId !== undefined && activeIds.has(reviveId)) {
        effects.push('Воскрешение: одна подходящая павшая цель, 50% ресурсов.')
        metrics.push({ label: 'Цена воскрешения', value: `${REVIVE_MANA_COST} MP` })
    }
    return { available: true, effects, metrics }
}
function commonMetrics(
    context: PrayerBuildContext,
    bonuses: Bonuses,
    revival: boolean
): PrayerBuildResult['metrics'] {
    const definition = ABILITY_DEFINITIONS[context.ability]
    const mother = context.ability === 'pray'
    const metrics = [
        radiusMetric(context, bonuses),
        {
            label: 'Время молитвы',
            value: `${Math.round(definition.windupMs * (mother ? bonuses.prayerDurationMultiplier : 1))} мс`,
        },
        { label: 'Цена молитвы', value: `${revival ? REVIVE_MANA_COST : definition.mana} MP` },
    ]
    return metrics
}
function radiusMetric(context: PrayerBuildContext, bonuses: Bonuses) {
    return {
        label: 'Радиус',
        value: constellationDistance(
            ABILITY_DEFINITIONS[context.ability].range,
            context.ability === 'pray' ? bonuses.prayerRadiusCells : 0,
            context.tileWidth
        ),
    }
}
function restorationMetrics(
    context: PrayerBuildContext,
    bonuses: Bonuses
): PrayerBuildResult['metrics'] {
    const mother = context.ability === 'pray'
    const multiplier = mother ? bonuses.prayerGiftMultiplier : 1
    const amount = Math.round(context.basePower * (prayerMoodQuality[context.mood] * multiplier))
    return [
        {
            label: context.resource.startsWith('HP')
                ? 'Лечение'
                : `Восстановление ${context.resource}`,
            value: `${amount} ${context.resource}`,
        },
        {
            label: mother ? 'Множитель лечения' : 'Множитель восстановления',
            value: times(multiplier),
        },
    ]
}
function revivalNode(ability: PrayerAbilityId): string | undefined {
    if (ability === 'pray') return 'prayer.revive'
    return ability === 'pray_grave' ? 'prayer_grave.revive' : undefined
}

function appendMotherEffects(
    effects: string[],
    metrics: PrayerBuildResult['metrics'],
    activeIds: ReadonlySet<string>,
    bonuses: Bonuses,
    context: PrayerBuildContext
): void {
    effects.push(`Очищение могил: требуется ${GRAVE_PURIFY_STEPS} успешных шагов.`)
    if (activeIds.has('prayer.harm')) appendHarm(effects, metrics, bonuses, context)
    if (bonuses.prayerArea)
        effects.push(
            'Общая молитва: одновременно лечит всех подходящих союзников и очищает все подходящие могилы в радиусе.'
        )
    if (activeIds.has('prayer.last_light')) {
        const value = context.lowHealthEligible ? 'Активен' : 'Условие не выполнено'
        effects.push(`Последний огонёк: ${value.toLocaleLowerCase('ru')}.`)
        metrics.push({ label: 'Последний огонёк', value })
    }
    appendInsight(effects, metrics, 'Знание Угольной Матери', bonuses.deityInsight)
    appendInsight(effects, metrics, 'Знание других богов', bonuses.otherDeityInsight)
}
function appendHarm(
    effects: string[],
    metrics: PrayerBuildResult['metrics'],
    bonuses: Bonuses,
    context: PrayerBuildContext
): void {
    const damage = Math.round(6 * (prayerMoodQuality[context.mood] * bonuses.prayerHarmMultiplier))
    effects.push('Кара наносит урон подходящей нежити в радиусе.')
    metrics.push(
        { label: 'Урон кары', value: `${damage} HP до поглощения` },
        { label: 'Множитель кары', value: times(bonuses.prayerHarmMultiplier) }
    )
}
function appendInsight(
    effects: string[],
    metrics: PrayerBuildResult['metrics'],
    label: string,
    rank: number
): void {
    if (rank === 0) return
    const value = insights[rank] ?? insights[0]!
    effects.push(`${label}: ${value.toLocaleLowerCase('ru')}.`)
    metrics.push({ label, value })
}
function healingTargets(ability: PrayerAbilityId, area: boolean): string {
    if (ability === 'pray')
        return area
            ? 'Лечение: себя и всех подходящих союзников в радиусе.'
            : 'Лечение: себя или одного подходящего союзника.'
    if (ability === 'pray_grave') return 'Лечение нежити: себя или одного подходящего союзника.'
    return ability === 'pray_road'
        ? 'Восстановление энергии: себе или одному подходящему союзнику.'
        : 'Восстановление маны: себе или одному подходящему союзнику.'
}
function times(value: number): string {
    return `×${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}`
}
