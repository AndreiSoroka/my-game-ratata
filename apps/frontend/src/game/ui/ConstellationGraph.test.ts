import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { constellationFixture } from '../testing/developmentFixture'
import ConstellationGraph from './ConstellationGraph.vue'

it('keeps secret stars unnamed, selects nodes by keyboard and controls zoom', async () => {
    const view = mount(ConstellationGraph, {
        props: { constellation: constellationFixture(), selectedId: 'prayer.root' },
    })
    expect(view.get('[data-node-id="prayer.radius2"]').attributes('aria-label')).toBe(
        'Неизвестная звезда · не открыта'
    )
    expect(view.get('[data-node-id="prayer.radius2"]').text()).toBe('?')
    await view.get('[data-node-id="prayer.root"]').trigger('keydown', { code: 'ArrowDown' })
    expect(view.emitted('select')?.at(-1)?.[0]).toBe('shadow.root')
    const initial = view.get('svg').attributes('viewBox')
    await view.get('[aria-label="Приблизить небосвод"]').trigger('click')
    expect(view.get('svg').attributes('viewBox')).not.toBe(initial)
    await view.get('[aria-label="Показать весь небосвод"]').trigger('click')
    expect(view.get('svg').attributes('viewBox')).toBe(initial)
    view.unmount()
})
