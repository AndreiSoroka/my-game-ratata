import {
    type ConstellationId,
    type DeityMood,
    type PrayerAbilityId,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import {
    prayerAnswerChance,
    prayerHarmChance,
    prayerMoodQuality,
    prayerPurificationChance,
} from '../../../../backend/src/game/prayerProbability'
import { chancePercent, successWithAdvantage } from './constellationChanceMath'
import { calculatePrayerBuild, type PrayerBuildResult } from './constellationPrayerBuild'

export interface PrayerCalculatorSchool {
    id: PrayerAbilityId
    god: string
    masteryName: string
}
export interface PrayerScenarioSettings {
    mood: DeityMood
    lowHealthEligible?: boolean
    tileWidth?: number
    aurasSuppressed?: boolean
    externalAdvantage?: boolean
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
    const example = exampleSettings(settings)
    const answer = prayerAnswerChance(mood)
    const node = fullConstellationCatalog.find((entry) => entry.id === nodeId)!
    const info = prayerSchoolInfo[school.id]
    const build =
        activeIds === undefined && node.effectType === 'active'
            ? undefined
            : calculatePrayerBuild(nodeId, activeIds ?? new Set(), {
                  ...info,
                  ability: node.activationAbilityId === 'pray_woven' ? 'pray_woven' : school.id,
                  mood,
                  lowHealthEligible: example.lowHealthEligible,
                  tileWidth: example.tileWidth,
                  aurasSuppressed: example.aurasSuppressed,
                  externalAdvantage: example.externalAdvantage,
              })
    const available = node.effectType === 'passive' || (build?.available ?? true)
    const metrics = available
        ? outcomeMetrics(nodeId, school.id, mood, answer, activeIds, example.externalAdvantage)
        : []
    return {
        school,
        metrics,
        ...(build === undefined ? {} : { build }),
        substitution: `P = ${chancePercent(answer)}; Q = ${number(prayerMoodQuality[mood])}`,
    }
}
function exampleSettings(settings: PrayerScenarioSettings) {
    return {
        lowHealthEligible: settings.lowHealthEligible ?? false,
        tileWidth: settings.tileWidth ?? 16,
        aurasSuppressed: settings.aurasSuppressed ?? false,
        externalAdvantage: settings.externalAdvantage ?? false,
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
    nodeId: string,
    ability: PrayerAbilityId,
    mood: DeityMood,
    answer: number,
    activeIds?: ReadonlySet<string>,
    externalAdvantage = false
): PrayerScenarioResult['metrics'] {
    const chance = (value: number) => chancePercent(successWithAdvantage(value, externalAdvantage))
    const own = ownOutcomeMetrics(nodeId, ability, mood, answer, chance)
    if (own !== undefined) return own
    const metrics = [{ label: chanceLabels[ability], value: chance(answer) }]
    if (ability === 'pray') {
        metrics.push({
            label: 'Шанс очищения могилы',
            value: `${chance(prayerPurificationChance(answer))} за шаг`,
        })
        if (activeIds?.has('prayer.harm'))
            metrics.push({ label: 'Шанс кары', value: chance(prayerHarmChance(answer)) })
    }
    const revive = reviveNodes[ability]
    if (revive && activeIds?.has(revive)) {
        const resurrection = resolveResurrectionParameters(ability, activeIds, mood)
        metrics.push({
            label: 'Шанс воскрешения',
            value: chance(resurrection.successChance),
        })
        if (resurrection.angelicChance > 0)
            metrics.push(
                {
                    label: 'Ангельское при успешном воскрешении',
                    value: chance(resurrection.angelicChance),
                },
                {
                    label: 'Общий шанс Ангельского воскрешения',
                    value: chancePercent(
                        successWithAdvantage(resurrection.successChance, externalAdvantage) *
                            successWithAdvantage(resurrection.angelicChance, externalAdvantage)
                    ),
                }
            )
    }
    return metrics
}
function ownOutcomeMetrics(
    nodeId: string,
    ability: PrayerAbilityId,
    mood: DeityMood,
    answer: number,
    chance: (value: number) => string
): PrayerScenarioResult['metrics'] | undefined {
    const node = fullConstellationCatalog.find((entry) => entry.id === nodeId)!
    if (nodeId.endsWith('.revive'))
        return [
            {
                label: 'Шанс воскрешения',
                value: chance(
                    resolveResurrectionParameters(ability, new Set(), mood).successChance
                ),
            },
        ]
    if (nodeId === 'prayer.revive_angelic')
        return [{ label: 'Ангельское при успешном воскрешении', value: chance(0.3) }]
    if (nodeId === 'prayer.harm')
        return [{ label: 'Шанс кары', value: chance(prayerHarmChance(answer)) }]
    if (nodeId === 'prayer.concentration')
        return [{ label: 'Защита от прерывания ударом', value: chance(0.5) }]
    if (node.effectType === 'passive') return []
    return undefined
}
function validateSettings(settings: PrayerScenarioSettings): void {
    if (!moods.includes(settings.mood)) throw new RangeError('Unknown deity mood')
    if (settings.lowHealthEligible !== undefined && typeof settings.lowHealthEligible !== 'boolean')
        throw new RangeError('Low-health eligibility must be a boolean')
    for (const flag of [settings.aurasSuppressed, settings.externalAdvantage]) {
        if (flag !== undefined && typeof flag !== 'boolean')
            throw new RangeError('Aura settings must be booleans')
    }
    if (
        settings.tileWidth !== undefined &&
        (!Number.isFinite(settings.tileWidth) || settings.tileWidth <= 0)
    )
        throw new RangeError('Tile width must be positive and finite')
}

function number(value: number): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}
