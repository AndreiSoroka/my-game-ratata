import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import ConstellationPrayerCalculator from './ConstellationPrayerCalculator.vue'

it('shows named learned outcomes and a mood input without editable Faith or Miracles', async () => {
    const active = new Set(['prayer.root', 'prayer.revive'])
    const view = mount(ConstellationPrayerCalculator, {
        props: { nodeId: 'prayer.root', enabledStarIds: active },
    })
    expect(view.find('[data-testid="debug-prayer-faith"]').exists()).toBe(false)
    expect(view.find('[data-testid="debug-prayer-miracles"]').exists()).toBe(false)
    expect(view.get('[data-testid="debug-prayer-metrics"]').text()).toContain('Шанс лечения55%')
    expect(view.get('[data-testid="debug-prayer-metrics"]').text()).toContain('Шанс воскрешения55%')
    expect(view.text()).not.toContain('Отказ божества')
    expect(view.find('select').exists()).toBe(false)
    expect(view.get('[data-testid="debug-prayer-calculator"]').attributes('open')).toBeUndefined()
    expect(view.get('summary').text()).toBe('Молитва: результат')
    expect(view.get('[data-mood="neutral"]').attributes('aria-pressed')).toBe('true')
    await view.get('[data-mood="benevolent"]').trigger('click')
    expect(view.get('[data-mood="benevolent"]').attributes('aria-pressed')).toBe('true')
    expect(view.get('[data-mood="neutral"]').attributes('aria-pressed')).toBe('false')
    expect(view.get('[data-testid="debug-prayer-metrics"]').text()).toContain('80%')
    expect(view.get('[data-build-metric="Радиус"]').text()).toBe('Радиус3 клетки')
    expect(view.get('[data-build-metric="Лечение"]').text()).toBe('Лечение8 HP')
    expect(view.text()).not.toContain('Размер клетки')
    expect(view.text()).not.toContain('не больше нехватки ресурса')
    view.unmount()
})
it('retains independent moods across schools and non-prayer selections', async () => {
    const active = new Set(['prayer.root', 'prayer_road.root'])
    const view = mount(ConstellationPrayerCalculator, {
        props: { nodeId: 'prayer.root', enabledStarIds: active },
    })
    await view.get('[data-mood="wrathful"]').trigger('click')
    await view.setProps({ nodeId: 'prayer_road.root' })
    expect(view.get('[data-mood="neutral"]').attributes('aria-pressed')).toBe('true')
    expect(view.get('summary').text()).toBe('Молитва странника: результат')
    await view.get('[data-mood="benevolent"]').trigger('click')
    await view.setProps({ nodeId: 'blade.root' })
    expect(view.find('details').exists()).toBe(false)
    await view.setProps({ nodeId: 'prayer.root' })
    expect(view.get('[data-mood="wrathful"]').attributes('aria-pressed')).toBe('true')
    await view.setProps({ nodeId: 'prayer_road.root' })
    expect(view.get('[data-mood="benevolent"]').attributes('aria-pressed')).toBe('true')
    view.unmount()
})
it('changes the inspected result without changing the build or losing the shared prayer mood', async () => {
    const active = new Set(['prayer.root', 'prayer.revive', 'prayer.harm', 'prayer.last_light'])
    const view = mount(ConstellationPrayerCalculator, {
        props: { nodeId: 'prayer.root', enabledStarIds: active },
    })
    await view.get('[data-mood="benevolent"]').trigger('click')
    expect(view.find('[data-testid="debug-last-light"]').exists()).toBe(true)
    await view.setProps({ nodeId: 'prayer.harm' })
    expect(view.get('summary').text()).toBe('Кара: результат')
    expect(view.get('h4').text()).toBe('Эффект навыка')
    expect(view.get('[data-testid="debug-prayer-metrics"]').text()).toBe('Шанс кары95%')
    expect(view.find('[data-testid="debug-last-light"]').exists()).toBe(false)
    expect(view.find('[data-build-metric="Лечение"]').exists()).toBe(false)
    await view.setProps({ nodeId: 'prayer.root' })
    expect(view.get('summary').text()).toBe('Молитва: результат')
    expect(view.get('[data-metric="Шанс лечения"] dd').text()).toBe('80%')
    expect(view.get('[data-metric="Шанс кары"] dd').text()).toBe('95%')
    expect(view.get('[data-build-metric="Урон кары"] dd').text()).toBe('8 HP до поглощения')
    expect([...active]).toEqual([
        'prayer.root',
        'prayer.revive',
        'prayer.harm',
        'prayer.last_light',
    ])
    view.unmount()
})
