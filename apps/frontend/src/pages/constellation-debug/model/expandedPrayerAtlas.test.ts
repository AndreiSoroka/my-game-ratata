import { expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../../backend/src/game/constellationNodes'
import { calculatePrayerScenario } from './constellationPrayerScenario'

const full = new Set(fullConstellationCatalog.map((node) => node.id))
const result = (id: string, settings = {}) =>
    calculatePrayerScenario(id, { mood: 'neutral', ...settings }, full)!
const metric = (id: string, label: string) =>
    result(id).build!.metrics.find((entry) => entry.label === label)?.value

it('shares both prayer limits while showing only each passive contribution', () => {
    expect(metric('prayer.root', 'Максимум целей')).toBe('20')
    expect(metric('prayer.area', 'Максимум целей')).toBe('20')
    expect(metric('prayer.targets2', 'Дополнительные цели обеих молитв')).toBe('+3')
    expect(metric('prayer.hasty_harm', 'Усиление урона Кары')).toBe('−100 п.п.')
    expect(
        result('prayer.hasty_harm').build!.metrics.some((entry) => entry.label === 'Лечение')
    ).toBe(false)
    const inactive = calculatePrayerScenario(
        'prayer.area',
        { mood: 'neutral' },
        new Set(['prayer.root'])
    )!
    expect(inactive.build!.available).toBe(false)
})
it('increases ordinary prayer capacity before Woven is known and keeps its single miracle mode', () => {
    const active = new Set(['prayer.root', 'prayer.targets1', 'prayer.targets2'])
    const ordinary = calculatePrayerScenario('prayer.root', { mood: 'neutral' }, active)!
    expect(ordinary.build!.available).toBe(true)
    expect(ordinary.build!.metrics).toContainEqual({ label: 'Максимум целей', value: '5' })
    expect(ordinary.build!.effects).toContain(
        'За одно применение выбирается один вид чуда для всех выбранных целей.'
    )
    expect(
        calculatePrayerScenario('prayer.area', { mood: 'neutral' }, active)!.build!.available
    ).toBe(false)
})
it('applies external advantage without granting the caster their own blessing', () => {
    expect(
        result('prayer.root').metrics.find((entry) => entry.label === 'Шанс лечения')?.value
    ).toBe('55%')
    const external = result('prayer.root', { externalAdvantage: true })
    expect(external.metrics.find((entry) => entry.label === 'Шанс лечения')?.value).toBe('79,75%')
    expect(external.metrics.find((entry) => entry.label === 'Шанс очищения могилы')?.value).toBe(
        '36% за шаг'
    )
    expect(
        external.metrics.find((entry) => entry.label === 'Ангельское при успешном воскрешении')
            ?.value
    ).toBe('51%')
    expect(result('prayer.aura_blessing').build!.metrics).toContainEqual({
        label: 'Собственные проверки',
        value: 'Без преимущества от своей ауры',
    })
    expect(
        result('prayer.concentration', { externalAdvantage: true }).build!.metrics
    ).toContainEqual({ label: 'Защита от прерывания ударом', value: '75%' })
})
it('suppresses only aura output and keeps Domain healing independent of healing multipliers', () => {
    const domain = result('prayer.aura_domain', { aurasSuppressed: true })
    expect(domain.build!.metrics).toContainEqual({ label: 'Аура', value: 'Подавлена' })
    expect(domain.build!.metrics).toContainEqual({
        label: 'Лечение всех живых',
        value: '5 × 1 HP: на 100, 200, 300, 400 и 500 мс',
    })
    const active = result('prayer.area', { aurasSuppressed: true })
    expect(active.build!.metrics).toContainEqual({ label: 'Состояние аур', value: 'Подавлены' })
    expect(active.build!.effects.some((entry) => entry.includes('пять раз'))).toBe(false)
    expect(active.build!.metrics.some((entry) => entry.label === 'Урон кары')).toBe(true)
})
