import type { DeityMood } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { calculatePrayerScenario, type PrayerScenarioSettings } from './constellationPrayerScenario'

const settings: PrayerScenarioSettings = { faithLevel: 1, mood: 'neutral' }
function scenario(
    ids: ReadonlySet<string>,
    options: PrayerScenarioSettings = settings,
    node = 'prayer.root'
) {
    const result = calculatePrayerScenario(node, options, ids)
    if (result?.build === undefined) throw new Error('Missing build result')
    return result
}
function metric(result: ReturnType<typeof scenario>, label: string): string | undefined {
    return result.build?.metrics.find((row) => row.label === label)?.value
}

describe('the selected Prayer root reports its actual cumulative build', () => {
    it('starts with healing and purification, then gains Kara, SurReply and Gnev cumulatively', () => {
        const ids = new Set(['prayer.root'])
        const initial = scenario(ids)
        expect(initial.build?.available).toBe(true)
        expect(initial.build?.effects.join(' ')).toContain('себя или одного подходящего союзника')
        expect(initial.build?.effects.join(' ')).toContain('Очищение могил')
        expect(initial.build?.effects.join(' ')).not.toContain('Кара')
        expect(metric(initial, 'Радиус')).toBe('48 px')
        expect(metric(initial, 'Время молитвы')).toBe('3000 мс')
        expect(metric(initial, 'Цена молитвы')).toBe('5 MP')
        expect(metric(initial, 'Лечение при ответе')).toContain('6 HP')
        ids.add('prayer.harm')
        const kara = scenario(ids)
        expect(kara.build?.effects.join(' ')).toContain('Кара: 6 HP')
        expect(metric(kara, 'Шанс кары')).toBe('75%')
        expect(metric(kara, 'Множитель кары')).toBe('×1')
        ids.add('prayer.harm1')
        expect(metric(scenario(ids), 'Урон кары')).toBe('8 HP до поглощения')
        expect(metric(scenario(ids), 'Множитель кары')).toBe('×1,3')
        ids.add('prayer.harm2')
        const gnev = scenario(ids)
        expect(metric(gnev, 'Урон кары')).toBe('10 HP до поглощения')
        expect(metric(gnev, 'Множитель кары')).toBe('×1,6')
        expect(metric(gnev, 'Шанс кары')).toBe('75%')
    })
    it('combines authored tile width, focus, area and both independent knowledge ranks', () => {
        const ids = new Set([
            'prayer.root',
            'prayer.radius1',
            'prayer.radius2',
            'prayer.focus',
            'prayer.area',
            'prayer.omen3',
            'prayer.others4',
        ])
        const result = scenario(ids, { ...settings, tileWidth: 24 })
        expect(metric(result, 'Радиус')).toBe('96 px')
        expect(metric(result, 'Время молитвы')).toBe('2700 мс')
        expect(result.build?.effects.join(' ')).toContain('себя и всех подходящих союзников')
        expect(result.build?.effects.join(' ')).toContain('все подходящие могилы')
        expect(metric(result, 'Знание Угольной Матери')).toBe('Настроение и шанс ответа')
        expect(metric(result, 'Знание других богов')).toBe('Настроение, шанс ответа и время смены')
    })
    it('applies Miracles and conditional Last Light without altering Faith from selected star count', () => {
        const ids = new Set(['prayer.root', 'prayer.gift1', 'prayer.gift2', 'prayer.last_light'])
        const strong = { faithLevel: 10, miraclesLevel: 10, mood: 'neutral' as const }
        const normal = scenario(ids, strong)
        expect(metric(normal, 'Множитель лечения')).toBe('×1,1')
        expect(metric(normal, 'Лечение при ответе')).toContain('26 HP')
        expect(metric(normal, 'Последний огонёк')).toBe('Условие не выполнено')
        const low = scenario(ids, { ...strong, lowHealthEligible: true })
        expect(metric(low, 'Множитель лечения')).toBe('×1,2')
        expect(metric(low, 'Лечение при ответе')).toContain('29 HP')
        expect(metric(low, 'Последний огонёк')).toBe('Активен')
        expect(low.metrics.find((row) => row.label === 'Шанс ответа')?.value).toBe('68,5%')
        ids.delete('prayer.last_light')
        expect(
            metric(scenario(ids, { ...strong, lowHealthEligible: true }), 'Множитель лечения')
        ).toBe('×1,1')
        expect(metric(scenario(new Set(['prayer.root']), strong), 'Лечение при ответе')).toContain(
            '24 HP'
        )
    })
})

describe('spell availability, revival and school boundaries', () => {
    it('reports unavailable roots without inventing zero deity probability or active effects', () => {
        const result = scenario(new Set(['prayer.harm', 'prayer.gift2']))
        expect(result.build).toEqual({ available: false, effects: [], metrics: [] })
        expect(result.metrics.find((row) => row.label === 'Шанс ответа')?.value).toBe('55%')
        expect(calculatePrayerScenario('prayer.root', settings)).not.toHaveProperty('build')
    })
    it.each([
        ['prayer', 'prayer.revive'],
        ['prayer_grave', 'prayer_grave.revive'],
    ])(
        'gates %s revival by both its root and explicit node and keeps standard resources',
        (path, revival) => {
            expect(scenario(new Set([`${path}.root`]), settings, revival).build?.available).toBe(
                false
            )
            expect(scenario(new Set([revival]), settings, revival).build?.available).toBe(false)
            const ids = new Set([
                `${path}.root`,
                revival,
                'prayer.focus',
                'prayer.last_light',
                'prayer.gift1',
                'prayer.gift2',
                'prayer.harm',
            ])
            const result = scenario(
                ids,
                { faithLevel: 10, miraclesLevel: 10, mood: 'benevolent', lowHealthEligible: true },
                revival
            )
            expect(result.build?.available).toBe(true)
            expect(metric(result, 'Цена молитвы')).toBe('20 MP')
            expect(metric(result, 'Ресурсы после воскрешения')).toContain('50% максимума')
            expect(metric(result, 'Лечение при ответе')).toBeUndefined()
            expect(metric(result, 'Шанс шага очищения')).toBeUndefined()
            expect(metric(result, 'Множитель кары')).toBeUndefined()
        }
    )
    it.each([
        ['prayer_road', 'Восстановление EN при ответе', '55 EN'],
        ['prayer_lantern', 'Восстановление MP при ответе', '39 MP'],
        ['prayer_grave', 'Лечение при ответе', '31 HP нежити'],
    ])('does not leak Mother bonuses into %s', (path, healingLabel, amount) => {
        const ids = new Set(fullConstellationCatalog.map((node) => node.id))
        const result = scenario(
            ids,
            {
                faithLevel: 10,
                miraclesLevel: 10,
                mood: 'benevolent',
                lowHealthEligible: true,
                tileWidth: 24,
            },
            `${path}.root`
        )
        expect(metric(result, 'Радиус')).toBe('48 px')
        expect(metric(result, 'Время молитвы')).toBe('3000 мс')
        expect(metric(result, healingLabel)).toContain(amount)
        expect(metric(result, 'Множитель восстановления')).toBe('×1')
        expect(metric(result, 'Множитель лечения')).toBeUndefined()
        expect(metric(result, 'Урон кары')).toBeUndefined()
        expect(metric(result, 'Шанс шага очищения')).toBeUndefined()
        expect(metric(result, 'Знание Угольной Матери')).toBeUndefined()
        expect(result.build?.effects.join(' ')).not.toMatch(/Кара|Общая молитва|Последний огонёк/)
    })
    it('never grants grave-school revival from the healing-school revival node', () => {
        const result = scenario(
            new Set(['prayer_grave.root', 'prayer.revive']),
            settings,
            'prayer_grave.root'
        )
        expect(result.build?.effects.join(' ')).not.toContain('Воскрешение')
    })
})

describe('builder settings validation and immutability', () => {
    it.each([0, 11, 1.5, NaN, null])('rejects invalid Miracles %s', (miraclesLevel) => {
        expect(() =>
            scenario(new Set(['prayer.root']), {
                ...settings,
                miraclesLevel: miraclesLevel as number,
            })
        ).toThrow(RangeError)
    })
    it.each([0, -1, NaN, Infinity])('rejects invalid tile width %s', (tileWidth) => {
        expect(() => scenario(new Set(['prayer.root']), { ...settings, tileWidth })).toThrow(
            RangeError
        )
    })
    it('rejects nonboolean eligibility and isolates settings, selected IDs and return values', () => {
        expect(() =>
            scenario(new Set(['prayer.root']), {
                ...settings,
                lowHealthEligible: 'true' as unknown as boolean,
            })
        ).toThrow(RangeError)
        const ids = new Set(['prayer.root', 'prayer.harm'])
        const input = { ...settings, miraclesLevel: 5 }
        const before = structuredClone(input)
        const first = scenario(ids, input)
        const expected = structuredClone(first)
        first.build?.effects.push('Changed')
        first.build?.metrics.splice(0)
        expect(scenario(ids, input)).toEqual(expected)
        expect(input).toEqual(before)
        expect([...ids]).toEqual(['prayer.root', 'prayer.harm'])
    })
})

describe('cumulative power matches the actual prayer engine for every Miracles level and mood', () => {
    const qualities = { benevolent: 1.3, neutral: 1, wrathful: 0.65 }
    const cases = Array.from({ length: 10 }, (_, index) => index + 1).flatMap((miraclesLevel) =>
        (['benevolent', 'neutral', 'wrathful'] as DeityMood[]).map((mood) => ({
            miraclesLevel,
            mood,
        }))
    )
    it.each(cases)(
        'keeps engine rounding at Miracles $miraclesLevel / $mood',
        ({ miraclesLevel, mood }) => {
            const builds = [
                {
                    gift1: false,
                    gift2: false,
                    last: false,
                    eligible: false,
                    harm1: false,
                    harm2: false,
                },
                {
                    gift1: true,
                    gift2: false,
                    last: false,
                    eligible: false,
                    harm1: true,
                    harm2: false,
                },
                { gift1: true, gift2: true, last: true, eligible: false, harm1: true, harm2: true },
                {
                    gift1: true,
                    gift2: false,
                    last: true,
                    eligible: true,
                    harm1: true,
                    harm2: false,
                },
                { gift1: true, gift2: true, last: true, eligible: true, harm1: true, harm2: true },
            ]
            for (const build of builds) {
                const ids = new Set(['prayer.root', 'prayer.harm'])
                for (const [enabled, id] of [
                    [build.gift1, 'prayer.gift1'],
                    [build.gift2, 'prayer.gift2'],
                    [build.last, 'prayer.last_light'],
                    [build.harm1, 'prayer.harm1'],
                    [build.harm2, 'prayer.harm2'],
                ] as const)
                    if (enabled) ids.add(id)
                const healM =
                    1 +
                    0.05 * (Number(build.gift1) + Number(build.gift2)) +
                    (build.last && build.eligible ? 0.1 : 0)
                const harmM = 1 + 0.3 * (Number(build.harm1) + Number(build.harm2))
                const heal = Math.round((6 + 2 * (miraclesLevel - 1)) * (qualities[mood] * healM))
                const harm = Math.round(
                    (6 + 2 * Math.max(0, miraclesLevel - 3)) * (qualities[mood] * harmM)
                )
                const result = scenario(ids, {
                    ...settings,
                    miraclesLevel,
                    mood,
                    lowHealthEligible: build.eligible,
                })
                expect(metric(result, 'Лечение при ответе')).toBe(
                    `${heal} HP (не больше нехватки ресурса)`
                )
                expect(metric(result, 'Урон кары')).toBe(`${harm} HP до поглощения`)
            }
        }
    )
})
