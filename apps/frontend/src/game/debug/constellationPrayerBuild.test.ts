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
        for (const [node, increase] of [
            ['prayer.harm1', 130],
            ['prayer.harm2', 330],
        ] as const) {
            expect(calculate(full, node).build!.metrics).toEqual([
                { label: 'Урон кары', value: `+${increase}%` },
            ])
            expect(calculate(full, node).metrics).toEqual([])
        }
        const root = calculate(full)
        expect(root.metrics).toContainEqual({ label: 'Шанс кары', value: '75%' })
        expect(metric(root, 'Лечение')).toBe('30 HP')
        expect(metric(root, 'Урон кары')).toBe('28 HP до поглощения')
    })
    it('keeps authored passive contributions readable when not included in the build', () => {
        const active = new Set(['prayer.root', 'prayer.harm'])
        const before = calculate(active, 'prayer.harm')
        active.add('prayer.gift1')
        active.add('prayer.gift2')
        expect(calculate(active, 'prayer.harm')).toEqual(before)
        expect(metric(calculate(active), 'Лечение')).toBe('29 HP')
        const unavailable = calculate(active, 'prayer.harm1')
        expect(unavailable.metrics).toEqual([])
        expect(unavailable.build).toEqual({
            available: false,
            effects: [],
            metrics: [{ label: 'Урон кары', value: '+130%' }],
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
        expect(metric(calculate(active), 'Урон кары')).toContain('14 HP')
        active.add('prayer.harm2')
        expect(metric(calculate(active), 'Урон кары')).toContain('34 HP')
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
            expect(metric(normal, 'Лечение')).toContain(`${Math.round(6 * (quality * 4.95))} HP`)
            expect(metric(last, 'Лечение')).toContain(`${Math.round(6 * (quality * 14.95))} HP`)
            expect(metric(normal, 'Урон кары')).toContain(`${Math.round(6 * (quality * 4.6))} HP`)
            expect(metric(last, 'Множитель лечения')).toBe('×14,95')
            expect(metric(last, 'Радиус')).toBe('5 клеток')
            expect(metric(last, 'Время молитвы')).toBe('600 мс')
        }
    )
    it.each([
        ['prayer_road', 15, 'EN'],
        ['prayer_lantern', 12, 'MP'],
        ['prayer_grave', 6, 'HP нежити'],
    ] as const)('isolates Mother modifiers from %s', (path, power, resource) => {
        const withoutAshModifiers = new Set(
            [...full].filter((id) => !id.startsWith('prayer_grave.') || id === 'prayer_grave.root')
        )
        const result = calculate(withoutAshModifiers, `${path}.root`, 'benevolent', true)
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
            expect(metric(revival, 'Цена воскрешения')).toBe(path === 'prayer' ? '5 MP' : '20 MP')
            expect(metric(revival, 'Ресурсы после воскрешения')).toContain(
                path === 'prayer' ? '1% максимума' : '50% максимума'
            )
            expect(metric(revival, 'Лечение')).toBeUndefined()
        }
    })
})

it('applies the full Ash healing build independently of Mother prayer bonuses', () => {
    const result = calculate(full, 'prayer_grave.root', 'benevolent', true)
    expect(metric(result, 'Лечение')).toBe('11 HP нежити')
    expect(metric(result, 'Радиус')).toBe('5 клеток')
    expect(metric(result, 'Максимум целей исцеления')).toBe('2')
    expect(result.metrics).toContainEqual({ label: 'Шанс лечения нежити', value: '86%' })
})

it('combines Ash revival ranks at the root while its unlock keeps the base roll', () => {
    const root = calculate(full, 'prayer_grave.root')
    expect(root.metrics).toContainEqual({ label: 'Шанс воскрешения', value: '70%' })
    expect(metric(root, 'HP после воскрешения')).toContain('80% максимума')
    const unlock = calculate(full, 'prayer_grave.revive')
    expect(unlock.metrics).toEqual([{ label: 'Шанс воскрешения', value: '55%' }])
    expect(unlock.substitution).toContain('P = 55%')
})

it('includes the chant at the root and lists only learned Road Prayer enhancements', () => {
    const root = 'prayer_road.root'
    const active = new Set([root])
    const initial = calculate(active, root)
    expect(metric(initial, 'Восстановление энергии во время песни')).toBe('×5')
    expect(initial.build!.effects.join(' ')).not.toMatch(/шагом|рывок/i)
    active.add('prayer_road.walk')
    const walking = calculate(active, root)
    expect(walking.build!.effects.join(' ')).toMatch(/шагом/)
    expect(walking.build!.effects.join(' ')).not.toMatch(/рывок стоит|энергии меньше/)
    active.add('prayer_road.shoulder')
    const shoulder = calculate(active, 'prayer_road.shoulder').build!
    expect(shoulder.effects.join(' ')).toMatch(/10.*8|8.*10/)
    expect(calculate(active, root).build!.effects).toEqual(expect.arrayContaining(shoulder.effects))
    active.add('prayer_road.bard')
    const bard = calculate(active, root)
    expect(metric(bard, 'Радиус')).toBe('3 клетки')
    expect(metric(bard, 'Радиус песни')).toBe('4,24 клетки')
})
