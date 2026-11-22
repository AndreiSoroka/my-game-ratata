import {
    ABILITY_DEFINITIONS,
    type DeityMood,
    GRAVE_PURIFY_STEPS,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerActionId,
    prayerSchoolId,
    ROAD_PRAYER_RULES,
} from '@my-game-ratata/contracts'

import { resolveConstellationBonuses } from '../../../../backend/src/game/constellationBonuses'
import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { prayerMoodQuality } from '../../../../backend/src/game/prayerProbability'
import { chancePercent, successWithAdvantage } from './constellationChanceMath'
import { constellationDistance } from './constellationDistance'
import { describePrayerPassive } from './constellationPrayerPassive'
import { revivalBuild } from './constellationRevivalBuild'

export interface PrayerBuildResult {
    available: boolean
    effects: string[]
    metrics: Array<{ label: string; value: string }>
}
export interface PrayerBuildContext {
    ability: PrayerActionId
    mood: DeityMood
    lowHealthEligible: boolean
    tileWidth: number
    resource: string
    basePower: number
    aurasSuppressed?: boolean
    externalAdvantage?: boolean
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
    const root = `${PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(context.ability)].constellationId}.root`
    const node = fullConstellationCatalog.find((entry) => entry.id === nodeId)
    if (node?.effectType === 'passive')
        return { available: activeIds.has(nodeId), ...describePrayerPassive(nodeId, context) }
    if (!activeIds.has(root) || !activeIds.has(nodeId))
        return { available: false, effects: [], metrics: [] }
    const bonuses = resolveConstellationBonuses(activeIds, context.lowHealthEligible)
    const mother = prayerSchoolId(context.ability) === 'pray'
    const metrics = commonMetrics(context, bonuses)
    metrics.push(...restorationMetrics(context, bonuses))
    const effects = [healingTargets(context.ability, bonuses.targetLimit)]
    if (mother)
        metrics.push({
            label: 'Максимум целей',
            value: String(bonuses.targetLimit),
        })
    if (mother) appendMotherEffects(effects, metrics, activeIds, bonuses, context)
    if (context.ability === 'pray_road') appendRoadEffects(effects, metrics, activeIds, context)
    const reviveId = revivalNode(context.ability)
    if (reviveId !== undefined && activeIds.has(reviveId)) {
        const revival = revivalBuild(activeIds, context)
        effects.push(...revival.effects)
        metrics.push(...revival.metrics)
    }
    return { available: true, effects, metrics }
}
function commonMetrics(
    context: PrayerBuildContext,
    bonuses: Bonuses
): PrayerBuildResult['metrics'] {
    const definition = ABILITY_DEFINITIONS[context.ability]
    const mother = prayerSchoolId(context.ability) === 'pray'
    const metrics = [
        radiusMetric(context, bonuses),
        {
            label: 'Время молитвы',
            value: `${Math.round(definition.windupMs * (mother ? bonuses.prayerDurationMultiplier : 1))} мс`,
        },
        {
            label: 'Цена молитвы',
            value:
                mother && bonuses.prayerLastLight
                    ? '30% максимальной MP за лечение; 5 MP за другое чудо'
                    : `${definition.mana} MP${context.ability === 'pray_road' ? '' : ' за цель'}`,
        },
    ]
    return metrics
}
function radiusMetric(context: PrayerBuildContext, bonuses: Bonuses) {
    return {
        label: 'Радиус',
        value: constellationDistance(
            ABILITY_DEFINITIONS[context.ability].range,
            prayerSchoolId(context.ability) === 'pray' ? bonuses.prayerRadiusCells : 0,
            context.tileWidth
        ),
    }
}
function restorationMetrics(
    context: PrayerBuildContext,
    bonuses: Bonuses
): PrayerBuildResult['metrics'] {
    const mother = prayerSchoolId(context.ability) === 'pray'
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
function revivalNode(ability: PrayerActionId): string | undefined {
    if (prayerSchoolId(ability) === 'pray') return 'prayer.revive'
    return ability === 'pray_grave' ? 'prayer_grave.revive' : undefined
}

function appendRoadEffects(
    effects: string[],
    metrics: PrayerBuildResult['metrics'],
    activeIds: ReadonlySet<string>,
    context: PrayerBuildContext
): void {
    effects.push('Походная песня помогает вам и всем видимым союзникам рядом, пока длится молитва.')
    const areaMultiplier = activeIds.has('prayer_road.bard')
        ? ROAD_PRAYER_RULES.bardAreaMultiplier
        : 1
    const radius = ABILITY_DEFINITIONS.pray_road.range * Math.sqrt(areaMultiplier)
    metrics.push({
        label: 'Восстановление энергии во время песни',
        value: times(ROAD_PRAYER_RULES.energyRegenMultiplier),
    })
    metrics.push({
        label: 'Радиус песни',
        value: constellationDistance(radius, 0, context.tileWidth),
    })
    for (const id of ['prayer_road.walk', 'prayer_road.shoulder', 'prayer_road.bard']) {
        if (!activeIds.has(id)) continue
        const star = fullConstellationCatalog.find((node) => node.id === id)
        effects.push(...(star?.results ?? []))
    }
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
    if (context.ability === 'pray_woven')
        effects.push(
            'Сплетённая молитва совмещает лечение, воскрешение, Кару, сдерживание нежити и очищение могил в одном общем лимите целей.'
        )
    else effects.push('За одно применение выбирается один вид чуда для всех выбранных целей.')
    if (bonuses.prayerConcentrationChance > 0)
        metrics.push({
            label: 'Защита от прерывания ударом',
            value: chancePercent(
                successWithAdvantage(bonuses.prayerConcentrationChance, context.externalAdvantage)
            ),
        })
    if (bonuses.prayerWardRank > 0)
        effects.push(
            ...fullConstellationCatalog
                .filter(
                    (node) =>
                        /^prayer\.ward[1-4]$/.test(node.id) &&
                        Number(node.id.at(-1)) <= bonuses.prayerWardRank
                )
                .map((node) => node.description)
        )
    if (bonuses.prayerMartyr)
        metrics.push({ label: 'Мученик: базовые HP / MP', value: '−30% / −15%' })
    const auras = ['prayer.aura_protection', 'prayer.aura_blessing', 'prayer.aura_domain'].filter(
        (id) => activeIds.has(id)
    )
    if (auras.length) {
        metrics.push({
            label: 'Состояние аур',
            value: context.aurasSuppressed
                ? 'Подавлены'
                : 'Действуют на всех подходящих в радиусе; вне лимита целей',
        })
        if (!context.aurasSuppressed)
            effects.push(
                ...auras.map(
                    (id) => fullConstellationCatalog.find((node) => node.id === id)!.description
                )
            )
    }
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
function healingTargets(ability: PrayerActionId, targetLimit: number): string {
    if (prayerSchoolId(ability) === 'pray')
        return `Лечение: себя и подходящих союзников в радиусе, не более ${targetLimit} целей.`
    if (ability === 'pray_grave') return 'Лечение нежити: себя или одного подходящего союзника.'
    return ability === 'pray_road'
        ? 'Разовый дар энергии получает клирик или один подходящий союзник.'
        : 'Восстановление маны: себе или одному подходящему союзнику.'
}
function times(value: number): string {
    return `×${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}`
}
