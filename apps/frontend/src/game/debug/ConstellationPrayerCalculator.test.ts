import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import ConstellationDebug from './ConstellationDebug.vue'
import ConstellationPrayerCalculator from './ConstellationPrayerCalculator.vue'

const metric = (view: ReturnType<typeof mount>, label: string) =>
    view.get(`[data-metric="${label}"] dd`).text()

it('recalculates immediately from bounded example inputs without changing URL or emitting game commands', async () => {
    const view = mount(ConstellationPrayerCalculator, { props: { nodeId: 'prayer.root' } })
    const originalUrl = window.location.href
    expect(view.get('h3').text()).toBe('Параметры примера')
    expect(view.get('[data-testid="debug-prayer-faith"]').findAll('option')).toHaveLength(10)
    expect(metric(view, 'Шанс ответа')).toBe('55%')
    expect(metric(view, 'Отказ божества')).toBe('45%')
    expect(metric(view, 'Шаг очищения могилы')).toBe('20%')
    await view.get('[data-testid="debug-prayer-faith"]').setValue('10')
    expect(metric(view, 'Шанс ответа')).toBe('68,5%')
    expect(metric(view, 'Шаг очищения могилы')).toBe('24,91%')
    await view.get('[data-testid="debug-prayer-mood"]').setValue('benevolent')
    expect(metric(view, 'Шанс ответа')).toBe('93,5%')
    expect(metric(view, 'Шаг очищения могилы')).toBe('34%')
    await view.get('[data-testid="debug-prayer-mood"]').setValue('wrathful')
    expect(metric(view, 'Шанс ответа')).toBe('38,5%')
    expect(metric(view, 'Шаг очищения могилы')).toBe('14%')
    expect(metric(view, 'Кара (если изучена)')).toBe('58,5%')
    expect(window.location.href).toBe(originalUrl)
    expect(view.emitted('command')).toBeUndefined()
    view.unmount()
})
it('retains four independent school contexts across stars and non-prayer selections', async () => {
    const view = mount(ConstellationPrayerCalculator, { props: { nodeId: 'prayer.root' } })
    const settings = [
        ['prayer.root', '10', 'wrathful'],
        ['prayer_road.root', '3', 'benevolent'],
        ['prayer_lantern.root', '4', 'wrathful'],
        ['prayer_grave.root', '7', 'neutral'],
    ] as const
    for (const [nodeId, faith, mood] of settings) {
        await view.setProps({ nodeId })
        expect(view.get('[data-testid="debug-prayer-faith"]').element).toHaveProperty('value', '1')
        expect(view.get('[data-testid="debug-prayer-mood"]').element).toHaveProperty(
            'value',
            'neutral'
        )
        await view.get('[data-testid="debug-prayer-faith"]').setValue(faith)
        await view.get('[data-testid="debug-prayer-mood"]').setValue(mood)
    }
    await view.setProps({ nodeId: 'blade.critical' })
    expect(view.find('[data-testid="debug-prayer-calculator"]').exists()).toBe(false)
    for (const [nodeId, faith, mood] of settings) {
        await view.setProps({ nodeId })
        expect(view.get('[data-testid="debug-prayer-faith"]').element).toHaveProperty(
            'value',
            faith
        )
        expect(view.get('[data-testid="debug-prayer-mood"]').element).toHaveProperty('value', mood)
    }
    await view.setProps({ nodeId: 'prayer.revive' })
    expect(metric(view, 'Шанс ответа')).toBe('38,5%')
    expect(view.find('[data-metric="Сила дара от настроения"]').exists()).toBe(false)
    await view.setProps({ nodeId: 'prayer_grave.revive' })
    expect(view.get('[data-testid="debug-prayer-faith"]').element).toHaveProperty('value', '7')
    expect(view.find('[data-metric="Шаг очищения могилы"]').exists()).toBe(false)
    view.unmount()
})
it('preserves examples when the atlas changes class and layout seed', async () => {
    const view = mount(ConstellationDebug, { props: { syncUrl: false } })
    await view.get('[data-testid="debug-prayer-faith"]').setValue('10')
    await view.get('[data-testid="debug-prayer-mood"]').setValue('benevolent')
    await view.get('[data-testid="debug-class"]').setValue('vanguard')
    expect(view.find('[data-testid="debug-prayer-calculator"]').exists()).toBe(false)
    await view.get('[data-testid="debug-class"]').setValue('cleric')
    expect(metric(view, 'Шанс ответа')).toBe('93,5%')
    await view.get('[data-testid="debug-seed"]').setValue('changed-layout-only')
    await view.get('form').trigger('submit')
    expect(metric(view, 'Шанс ответа')).toBe('93,5%')
    view.unmount()
})
