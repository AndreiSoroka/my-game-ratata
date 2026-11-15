import type { DeityMood, PrayerAbilityId } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import {
    prayerAnswerChance,
    prayerHarmChance,
    prayerPurificationChance,
} from '../../../../backend/src/game/prayerProbability'
import { chancePercent } from './constellationChanceMath'
import { calculatePrayerScenario, prayerCalculatorSchool } from './constellationPrayerScenario'

const schools: Array<{ path: string; id: PrayerAbilityId; god: string; faithName: string }> = [
    { path: 'prayer', id: 'pray', god: 'Угольная Мать', faithName: 'Вера' },
    { path: 'prayer_road', id: 'pray_road', god: 'Безымянный Путник', faithName: 'Вера странника' },
    {
        path: 'prayer_lantern',
        id: 'pray_lantern',
        god: 'Слепой Архивариус',
        faithName: 'Вера ясности',
    },
    { path: 'prayer_grave', id: 'pray_grave', god: 'Хранитель Праха', faithName: 'Вера праха' },
]
const moods: DeityMood[] = ['benevolent', 'neutral', 'wrathful']
const base = { benevolent: 0.8, neutral: 0.55, wrathful: 0.25 }
const cases = schools.flatMap((school) =>
    Array.from({ length: 10 }, (_, index) => index + 1).flatMap((faithLevel) =>
        moods.map((mood) => ({ ...school, faithLevel, mood }))
    )
)

describe('pure prayer calculator with four independent school identities', () => {
    it.each(cases)(
        'matches shared math for $id, Faith $faithLevel, $mood',
        ({ path, id, god, faithName, faithLevel, mood }) => {
            const result = calculatePrayerScenario(`${path}.root`, { faithLevel, mood })
            expect(result?.school).toEqual({ id, god, faithName })
            const answer = Math.min(0.95, base[mood] + (faithLevel - 1) * 0.015)
            expect(prayerAnswerChance(faithLevel, mood)).toBe(answer)
            const metric = (label: string) =>
                result?.metrics.find((row) => row.label === label)?.value
            expect(metric('Шанс ответа')).toBe(chancePercent(answer))
            expect(metric('Отказ божества')).toBe(chancePercent(1 - answer))
            const grave =
                id === 'pray' ? chancePercent(prayerPurificationChance(answer)) : undefined
            const harm = id === 'pray' ? chancePercent(prayerHarmChance(answer)) : undefined
            expect(metric('Шаг очищения могилы')).toBe(grave)
            expect(metric('Кара (если изучена)')).toBe(harm)
            expect(result?.substitution).toContain(`(${faithLevel} − 1)`)
            expect(result?.substitution).toContain(`= ${chancePercent(answer)}`)
            expect(result?.substitution).not.toMatch(/[А-Яа-яЁё]/)
        }
    )
    it('maps all24 prayer stars to the matching school while ignoring other or unknown nodes', () => {
        for (const school of schools) {
            const matching = fullConstellationCatalog.filter(
                (node) => node.constellationId === school.path
            )
            for (const node of matching)
                expect(prayerCalculatorSchool(node.id)).toEqual({
                    id: school.id,
                    god: school.god,
                    faithName: school.faithName,
                })
        }
        expect(prayerCalculatorSchool('blade.root')).toBeUndefined()
        expect(prayerCalculatorSchool('prayer.unknown')).toBeUndefined()
        expect(
            calculatePrayerScenario('blade.root', { faithLevel: 1, mood: 'neutral' })
        ).toBeUndefined()
    })
    it('shows exact neutral defaults and favorable caps with a short substituted expression', () => {
        const initial = calculatePrayerScenario('prayer.root', { faithLevel: 1, mood: 'neutral' })
        expect(initial?.substitution).toBe('min(95, 55 + (1 − 1) × 1,5) = 55%')
        expect(initial?.metrics).toEqual([
            { label: 'Шанс ответа', value: '55%' },
            { label: 'Отказ божества', value: '45%' },
            { label: 'Шаг очищения могилы', value: '20%' },
            { label: 'Кара (если изучена)', value: '75%' },
            { label: 'Сила дара от настроения', value: '×1' },
        ])
        const high = calculatePrayerScenario('prayer.root', { faithLevel: 10, mood: 'benevolent' })
        expect(high?.metrics.find((row) => row.label === 'Шанс ответа')?.value).toBe('93,5%')
        expect(high?.metrics.find((row) => row.label === 'Кара (если изучена)')?.value).toBe('95%')
        expect(high?.metrics.find((row) => row.label === 'Сила дара от настроения')?.value).toBe(
            '×1,3'
        )
    })
    it.each(['prayer.revive', 'prayer_grave.revive'])(
        'shows only answer and refusal for %s, preserving fixed revival resources',
        (nodeId) => {
            const result = calculatePrayerScenario(nodeId, { faithLevel: 10, mood: 'benevolent' })
            expect(result?.metrics).toEqual([
                { label: 'Шанс ответа', value: '93,5%' },
                { label: 'Отказ божества', value: '6,5%' },
            ])
        }
    )
})

describe('scenario input guards and isolation', () => {
    it.each([0, -1, 11, 1.5, NaN, Infinity, '5' as unknown as number])(
        'rejects invalid Faith %s',
        (faithLevel) => {
            expect(() =>
                calculatePrayerScenario('prayer.root', { faithLevel, mood: 'neutral' })
            ).toThrow(RangeError)
        }
    )
    it.each(['friendly', '', null, undefined])('rejects invalid mood %s', (mood) => {
        expect(() =>
            calculatePrayerScenario('prayer.root', { faithLevel: 1, mood: mood as DeityMood })
        ).toThrow(RangeError)
    })
    it('never changes settings, catalog or another result, nor consumes clocks or gameplay randomness', () => {
        const catalog = structuredClone(fullConstellationCatalog)
        const settings = { faithLevel: 5, mood: 'wrathful' as DeityMood }
        const original = { ...settings }
        const random = vi.spyOn(Math, 'random')
        const clock = vi.spyOn(Date, 'now')
        const first = calculatePrayerScenario('prayer.root', settings)!
        const second = calculatePrayerScenario('prayer.root', settings)!
        const untouched = structuredClone(second)
        first.school.faithName = 'Changed'
        first.metrics.push({ label: 'Changed', value: '100%' })
        expect(second).toEqual(untouched)
        expect(calculatePrayerScenario('prayer.root', settings)).toEqual(untouched)
        expect(settings).toEqual(original)
        expect(fullConstellationCatalog).toEqual(catalog)
        expect(random).not.toHaveBeenCalled()
        expect(clock).not.toHaveBeenCalled()
        random.mockRestore()
        clock.mockRestore()
    })
})
