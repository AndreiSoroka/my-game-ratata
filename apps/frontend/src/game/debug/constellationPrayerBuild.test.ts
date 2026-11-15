import { describe, expect, it } from 'vitest'

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
    it('composes Kara without changing base healing or probability from acquired stars', () => {
        const active = new Set(['prayer.root'])
        expect(metric(calculate(active), 'Лечение при ответе')).toContain('6 HP')
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
            expect(metric(normal, 'Лечение при ответе')).toContain(
                `${Math.round(6 * (quality * 1.1))} HP`
            )
            expect(metric(last, 'Лечение при ответе')).toContain(
                `${Math.round(6 * (quality * 1.2))} HP`
            )
            expect(metric(normal, 'Урон кары')).toContain(`${Math.round(6 * (quality * 1.6))} HP`)
            expect(metric(last, 'Множитель лечения')).toBe('×1,2')
            expect(metric(last, 'Радиус')).toBe('80 px')
            expect(metric(last, 'Время молитвы')).toBe('2700 мс')
        }
    )
    it.each([
        ['prayer_road', 15, 'EN'],
        ['prayer_lantern', 12, 'MP'],
        ['prayer_grave', 6, 'HP нежити'],
    ] as const)('isolates Mother modifiers from %s', (path, power, resource) => {
        const result = calculate(full, `${path}.root`, 'benevolent', true)
        const label = resource.startsWith('HP')
            ? 'Лечение при ответе'
            : `Восстановление ${resource} при ответе`
        expect(metric(result, label)).toContain(`${Math.round(power * 1.3)} ${resource}`)
        expect(metric(result, 'Радиус')).toBe('48 px')
        expect(metric(result, 'Время молитвы')).toBe('3000 мс')
        expect(result.build!.effects.join(' ')).not.toContain('Кара')
    })
    it('requires the own revival star, costs20 MP and restores fixed half resources', () => {
        for (const path of ['prayer', 'prayer_grave']) {
            const rootOnly = new Set([`${path}.root`])
            expect(calculate(rootOnly, `${path}.revive`).build!.available).toBe(false)
            rootOnly.add(`${path}.revive`)
            const revival = calculate(rootOnly, `${path}.revive`, 'benevolent', true)
            expect(revival.build!.available).toBe(true)
            expect(metric(revival, 'Цена молитвы')).toBe('20 MP')
            expect(metric(revival, 'Ресурсы после воскрешения')).toContain('50%')
            expect(metric(revival, 'Лечение при ответе')).toBeUndefined()
        }
    })
})
