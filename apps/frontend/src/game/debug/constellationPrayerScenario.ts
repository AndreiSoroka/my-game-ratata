import type { ConstellationId, DeityMood, PrayerAbilityId } from '@my-game-ratata/contracts'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import {
    prayerAnswerChance,
    prayerHarmChance,
    prayerMoodQuality,
    prayerPurificationChance,
} from '../../../../backend/src/game/prayerProbability'
import { chancePercent } from './constellationChanceMath'
import {
    calculatePrayerBuild,
    type PrayerBuildFocus,
    prayerBuildFocus,
    type PrayerBuildResult,
} from './constellationPrayerBuild'

export interface PrayerCalculatorSchool {
    id: PrayerAbilityId
    god: string
    masteryName: string
}
export interface PrayerScenarioSettings {
    mood: DeityMood
    lowHealthEligible?: boolean
    tileWidth?: number
}
export interface PrayerScenarioResult {
    school: PrayerCalculatorSchool
    metrics: Array<{ label: string; value: string }>
    substitution: string
    build?: PrayerBuildResult
}
export const prayerSchoolInfo = {
    pray: {
        god: 'Угольная Мать',
        masteryName: 'Чудеса',
        resource: 'HP',
        basePower: 6,
    },
    pray_road: {
        god: 'Безымянный Путник',
        masteryName: 'Путь странника',
        resource: 'EN',
        basePower: 15,
    },
    pray_lantern: {
        god: 'Слепой Архивариус',
        masteryName: 'Ясность',
        resource: 'MP',
        basePower: 12,
    },
    pray_grave: {
        god: 'Хранитель Праха',
        masteryName: 'Прах',
        resource: 'HP нежити',
        basePower: 6,
    },
} as const
const schoolAbilities: Partial<Record<ConstellationId, PrayerAbilityId>> = {
    prayer: 'pray',
    prayer_road: 'pray_road',
    prayer_lantern: 'pray_lantern',
    prayer_grave: 'pray_grave',
}
const moods: DeityMood[] = ['benevolent', 'neutral', 'wrathful']

export function prayerAbilityForConstellation(path: ConstellationId): PrayerAbilityId | undefined {
    return schoolAbilities[path]
}

/** Canonical atlas node metadata only; no live character, patron or deity state is consulted. */
export function prayerCalculatorSchool(nodeId: string): PrayerCalculatorSchool | undefined {
    const node = fullConstellationCatalog.find((entry) => entry.id === nodeId)
    const id = node === undefined ? undefined : prayerAbilityForConstellation(node.constellationId)
    if (id === undefined) return undefined
    const info = prayerSchoolInfo[id]
    return { id, god: info.god, masteryName: info.masteryName }
}

/** Pure example calculation. Invalid public inputs are rejected rather than rendered as NaN. */
export function calculatePrayerScenario(
    nodeId: string,
    settings: PrayerScenarioSettings,
    activeIds?: ReadonlySet<string>
): PrayerScenarioResult | undefined {
    validateSettings(settings)
    const school = prayerCalculatorSchool(nodeId)
    if (school === undefined) return undefined
    const { mood } = settings
    const answer = prayerAnswerChance(mood)
    const focus = prayerBuildFocus(nodeId)
    const info = prayerSchoolInfo[school.id]
    const build =
        activeIds === undefined
            ? undefined
            : calculatePrayerBuild(nodeId, activeIds, {
                  ...info,
                  ability: school.id,
                  mood,
                  lowHealthEligible: settings.lowHealthEligible ?? false,
                  tileWidth: settings.tileWidth ?? 16,
              })
    const available = build?.available ?? true
    const metrics = available ? outcomeMetrics(school.id, focus, answer, activeIds) : []
    return {
        school,
        metrics,
        ...(build === undefined ? {} : { build }),
        substitution: `P = ${chancePercent(answer)}; Q = ${number(prayerMoodQuality[mood])}`,
    }
}
const chanceLabels: Record<PrayerAbilityId, string> = {
    pray: 'Шанс лечения',
    pray_road: 'Шанс восстановления энергии',
    pray_lantern: 'Шанс восстановления маны',
    pray_grave: 'Шанс лечения нежити',
}
const reviveNodes: Partial<Record<PrayerAbilityId, string>> = {
    pray: 'prayer.revive',
    pray_grave: 'prayer_grave.revive',
}
function outcomeMetrics(
    ability: PrayerAbilityId,
    focus: PrayerBuildFocus,
    answer: number,
    activeIds?: ReadonlySet<string>
): PrayerScenarioResult['metrics'] {
    if (focus === 'revival') return [{ label: 'Шанс воскрешения', value: chancePercent(answer) }]
    if (focus === 'harm')
        return [{ label: 'Шанс кары', value: chancePercent(prayerHarmChance(answer)) }]
    const metrics = [{ label: chanceLabels[ability], value: chancePercent(answer) }]
    if (ability === 'pray') {
        metrics.push({
            label: 'Шанс очищения могилы',
            value: `${chancePercent(prayerPurificationChance(answer))} за шаг`,
        })
        if (activeIds?.has('prayer.harm'))
            metrics.push({ label: 'Шанс кары', value: chancePercent(prayerHarmChance(answer)) })
    }
    const revive = reviveNodes[ability]
    if (revive && activeIds?.has(revive))
        metrics.push({ label: 'Шанс воскрешения', value: chancePercent(answer) })
    return metrics
}
function validateSettings(settings: PrayerScenarioSettings): void {
    if (!moods.includes(settings.mood)) throw new RangeError('Unknown deity mood')
    if (settings.lowHealthEligible !== undefined && typeof settings.lowHealthEligible !== 'boolean')
        throw new RangeError('Low-health eligibility must be a boolean')
    if (
        settings.tileWidth !== undefined &&
        (!Number.isFinite(settings.tileWidth) || settings.tileWidth <= 0)
    )
        throw new RangeError('Tile width must be positive and finite')
}

function number(value: number): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}
