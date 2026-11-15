import type { ConstellationId, DeityMood, PrayerAbilityId } from '@my-game-ratata/contracts'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import {
    prayerAnswerChance,
    prayerHarmChance,
    prayerMoodBaseChance,
    prayerMoodQuality,
    prayerPurificationChance,
} from '../../../../backend/src/game/prayerProbability'
import { chancePercent } from './constellationChanceMath'
import { calculatePrayerBuild, type PrayerBuildResult } from './constellationPrayerBuild'

export interface PrayerCalculatorSchool {
    id: PrayerAbilityId
    god: string
    faithName: string
}
export interface PrayerScenarioSettings {
    faithLevel: number
    mood: DeityMood
    miraclesLevel?: number
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
        faithName: 'Вера',
        miraclesName: 'Чудеса',
        resource: 'HP',
        basePower: 6,
        growth: 2,
    },
    pray_road: {
        god: 'Безымянный Путник',
        faithName: 'Вера странника',
        miraclesName: 'Чудеса странника',
        resource: 'EN',
        basePower: 15,
        growth: 3,
    },
    pray_lantern: {
        god: 'Слепой Архивариус',
        faithName: 'Вера ясности',
        miraclesName: 'Чудеса ясности',
        resource: 'MP',
        basePower: 12,
        growth: 2,
    },
    pray_grave: {
        god: 'Хранитель Праха',
        faithName: 'Вера праха',
        miraclesName: 'Чудеса праха',
        resource: 'HP нежити',
        basePower: 6,
        growth: 2,
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
    return { id, god: info.god, faithName: info.faithName }
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
    const { faithLevel, mood } = settings
    const answer = prayerAnswerChance(faithLevel, mood)
    const revival = nodeId.endsWith('.revive')
    const metrics = [
        { label: 'Шанс ответа', value: chancePercent(answer) },
        { label: 'Отказ божества', value: chancePercent(1 - answer) },
        ...(!revival && school.id === 'pray'
            ? [
                  {
                      label: 'Шаг очищения могилы',
                      value: chancePercent(prayerPurificationChance(answer)),
                  },
                  { label: 'Кара (если изучена)', value: chancePercent(prayerHarmChance(answer)) },
              ]
            : []),
        ...(!revival
            ? [{ label: 'Сила дара от настроения', value: `×${number(prayerMoodQuality[mood])}` }]
            : []),
    ]
    const base = number(prayerMoodBaseChance[mood] * 100)
    return {
        school,
        metrics,
        ...(activeIds === undefined
            ? {}
            : {
                  build: calculatePrayerBuild(nodeId, activeIds, {
                      ...prayerSchoolInfo[school.id],
                      ability: school.id,
                      faithLevel,
                      mood,
                      miraclesLevel:
                          settings.miraclesLevel === undefined ? 1 : settings.miraclesLevel,
                      lowHealthEligible:
                          settings.lowHealthEligible === undefined
                              ? false
                              : settings.lowHealthEligible,
                      tileWidth: settings.tileWidth === undefined ? 16 : settings.tileWidth,
                  }),
              }),
        substitution: `min(95, ${base} + (${faithLevel} − 1) × 1,5) = ${chancePercent(answer)}`,
    }
}
function validateSettings(settings: PrayerScenarioSettings): void {
    if (
        !Number.isInteger(settings.faithLevel) ||
        settings.faithLevel < 1 ||
        settings.faithLevel > 10
    ) {
        throw new RangeError('Faith level must be an integer from 1 to 10')
    }
    if (!moods.includes(settings.mood)) throw new RangeError('Unknown deity mood')
    validateBuildSettings(settings)
}
function validateBuildSettings(settings: PrayerScenarioSettings): void {
    const miracles = settings.miraclesLevel === undefined ? 1 : settings.miraclesLevel
    if (!Number.isInteger(miracles) || miracles < 1 || miracles > 10)
        throw new RangeError('Miracles level must be an integer from 1 to 10')
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
