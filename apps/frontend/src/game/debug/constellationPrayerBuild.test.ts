import { describe, expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { enableAllConstellationStars } from './constellationBuild'
import { calculatePrayerScenario } from './constellationPrayerScenario'

const full = enableAllConstellationStars()
const calculate = (
    active: ReadonlySet<string> = full,
    node = 'prayer.root',
    mood: 'neutral' | 'benevolent' | 'wrathful' = 'neutral',
    lowHealthEligible = false
) => calculatePrayerScenario(node, { mood, lowHealthEligible, tileWidth: 16 }, active)!
const metric = (result: ReturnType<typeof calculate>, label: string) =>
    result.build!.metrics.find((row) => row.label === label)?.value

describe('fixed prayer power and cumulative learned modifiers', () => {
    it('isolates the own effect of Kara and each damage enhancement', () => {
        const kara = calculate(full, 'prayer.harm', 'neutral', true)
        expect(kara.metrics).toEqual([{ label: 'Шанс кары', value: '75%' }])
        expect(kara.build!.effects).toEqual(['Наносит урон подходящей нежити в радиусе молитвы.'])
        expect(kara.build!.metrics).toEqual([{ label: 'Урон кары', value: '6 HP до поглощения' }])
        for (const node of ['prayer.harm1', 'prayer.harm2']) {
            expect(calculate(full, node).build!.metrics).toEqual([
                { label: 'Урон кары', value: '+30%' },
            ])
            expect(calculate(full, node).metrics).toEqual([])
        }
        const root = calculate(full)
        expect(root.metrics).toContainEqual({ label: 'Шанс кары', value: '75%' })
        expect(metric(root, 'Лечение')).toBe('7 HP')
        expect(metric(root, 'Урон кары')).toBe('10 HP до поглощения')
    })
    it('keeps authored passive contributions readable when not included in the build', () => {
        const active = new Set(['prayer.root', 'prayer.harm'])
        const before = calculate(active, 'prayer.harm')
        active.add('prayer.gift1')
        active.add('prayer.gift2')
        expect(calculate(active, 'prayer.harm')).toEqual(before)
        expect(metric(calculate(active), 'Лечение')).toBe('7 HP')
        const unavailable = calculate(active, 'prayer.harm1')
        expect(unavailable.metrics).toEqual([])
        expect(unavailable.build).toEqual({
            available: false,
            effects: [],
            metrics: [{ label: 'Урон кары', value: '+30%' }],
        })
    })
    it('isolates every prayer passive from every other selected star, including its ancestors', () => {
        const nodes = fullConstellationCatalog.filter(
            (node) => node.constellationId.startsWith('prayer') && node.effectType === 'passive'
        )
        for (const node of nodes) {
            const combined = calculate(full, node.id)
            const isolated = calculate(new Set([node.id]), node.id)
            expect(combined.build).toEqual(isolated.build)
            expect(combined.metrics).toEqual(isolated.metrics)
            expect(combined.build!.effects.length + combined.build!.metrics.length).toBeGreaterThan(
                0
            )
        }
    })
    it('composes Kara without changing base healing or probability from acquired stars', () => {
        const active = new Set(['prayer.root'])
        expect(metric(calculate(active), 'Лечение')).toContain('6 HP')
        expect(calculate(active).build!.effects.join(' ')).not.toContain('Кара')
        active.add('prayer.harm')
        expect(metric(calculate(active), 'Урон кары')).toContain('6 HP')
        active.add('prayer.harm1')
        expect(metric(calculate(active), 'Урон кары')).toContain('8 HP')
        active.add('prayer.harm2')
        expect(metric(calculate(active), 'Урон кары')).toContain('10 HP')
        expect(calculate(active).metrics.find((row) => row.label === 'Шанс лечения')?.value).toBe(
            '55%'
        )
        expect(calculate(active).metrics.find((row) => row.label === 'Шанс кары')?.value).toBe(
            '75%'
        )
    })
    it.each(['neutral', 'benevolent', 'wrathful'] as const)(
        'applies mood and additive healing bonuses at %s',
        (mood) => {
            const quality = { neutral: 1, benevolent: 1.3, wrathful: 0.65 }[mood]
            const normal = calculate(full, 'prayer.root', mood)
            const last = calculate(full, 'prayer.root', mood, true)
            expect(metric(normal, 'Лечение')).toContain(`${Math.round(6 * (quality * 1.1))} HP`)
            expect(metric(last, 'Лечение')).toContain(`${Math.round(6 * (quality * 1.2))} HP`)
            expect(metric(normal, 'Урон кары')).toContain(`${Math.round(6 * (quality * 1.6))} HP`)
            expect(metric(last, 'Множитель лечения')).toBe('×1,2')
            expect(metric(last, 'Радиус')).toBe('5 клеток')
            expect(metric(last, 'Время молитвы')).toBe('2700 мс')
        }
    )
    it.each([
        ['prayer_road', 15, 'EN'],
        ['prayer_lantern', 12, 'MP'],
        ['prayer_grave', 6, 'HP нежити'],
    ] as const)('isolates Mother modifiers from %s', (path, power, resource) => {
        const result = calculate(full, `${path}.root`, 'benevolent', true)
        const label = resource.startsWith('HP') ? 'Лечение' : `Восстановление ${resource}`
        expect(metric(result, label)).toContain(`${Math.round(power * 1.3)} ${resource}`)
        expect(metric(result, 'Радиус')).toBe('3 клетки')
        expect(metric(result, 'Время молитвы')).toBe('3000 мс')
        expect(result.build!.effects.join(' ')).not.toContain('Кара')
    })
    it('requires the own revival star, costs20 MP and restores school-specific resources', () => {
        for (const path of ['prayer', 'prayer_grave']) {
            const rootOnly = new Set([`${path}.root`])
            expect(calculate(rootOnly, `${path}.revive`).build!.available).toBe(false)
            rootOnly.add(`${path}.revive`)
            const revival = calculate(rootOnly, `${path}.revive`, 'benevolent', true)
            expect(revival.build!.available).toBe(true)
            expect(metric(revival, 'Цена воскрешения')).toBe('20 MP')
            expect(metric(revival, 'Ресурсы после воскрешения')).toContain(
                path === 'prayer' ? '1% максимума' : '50% максимума'
            )
            expect(metric(revival, 'Лечение')).toBeUndefined()
        }
    })
})
