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
    await view.get('[data-testid="debug-prayer-mood"]').setValue('benevolent')
    expect(view.get('[data-testid="debug-prayer-metrics"]').text()).toContain('80%')
    view.unmount()
})
it('retains independent moods across schools and non-prayer selections', async () => {
    const active = new Set(['prayer.root', 'prayer_road.root'])
    const view = mount(ConstellationPrayerCalculator, {
        props: { nodeId: 'prayer.root', enabledStarIds: active },
    })
    await view.get('[data-testid="debug-prayer-mood"]').setValue('wrathful')
    await view.setProps({ nodeId: 'prayer_road.root' })
    expect(view.get('[data-testid="debug-prayer-mood"]').element).toHaveProperty('value', 'neutral')
    await view.get('[data-testid="debug-prayer-mood"]').setValue('benevolent')
    await view.setProps({ nodeId: 'blade.root' })
    expect(view.find('section').exists()).toBe(false)
    await view.setProps({ nodeId: 'prayer.root' })
    expect(view.get('[data-testid="debug-prayer-mood"]').element).toHaveProperty(
        'value',
        'wrathful'
    )
    await view.setProps({ nodeId: 'prayer_road.root' })
    expect(view.get('[data-testid="debug-prayer-mood"]').element).toHaveProperty(
        'value',
        'benevolent'
    )
    view.unmount()
})
