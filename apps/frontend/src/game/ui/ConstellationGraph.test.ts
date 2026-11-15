import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { constellationFixture, fixtureStarId } from '../testing/developmentFixture'
import { developmentCharacterFixture } from '../testing/developmentFixture'
import CharacterDevelopment from './CharacterDevelopment.vue'
import ConstellationGraph from './ConstellationGraph.vue'
import { constellationLabels } from './constellationLabels'

it('keeps unknown stars generic and clickable in detailed mode and preserves fixed bounds across reveals', async () => {
    const sky = constellationFixture()
    const view = mount(ConstellationGraph, {
        props: { constellation: sky, selectedId: fixtureStarId('prayer.root') },
    })
    const initial = view.get('svg').attributes('viewBox')
    const unknown = () => view.get(`[data-node-id="${fixtureStarId('prayer.radius2')}"]`)
    expect(unknown().attributes('aria-label')).toBe('Неизвестно')
    expect(unknown().attributes('aria-hidden')).toBe('true')
    await view.get(`[data-node-id="${fixtureStarId('prayer.root')}"]`).trigger('click')
    expect(unknown().attributes('role')).toBe('button')
    await unknown().trigger('click')
    expect(view.emitted('select')?.at(-1)).toEqual([fixtureStarId('prayer.radius2')])
    const focused = view.get('svg').attributes('viewBox')
    await view.setProps({ constellation: constellationFixture(true) })
    expect(view.get('svg').attributes('viewBox')).toBe(focused)
    await view.get('[aria-label="Показать весь небосвод"]').trigger('click')
    expect(view.get('svg').attributes('viewBox')).toBe(initial)
    view.unmount()
})
it('shows one word and no knowledge or predecessor metadata for an unknown root', async () => {
    const view = mount(CharacterDevelopment, {
        props: { player: developmentCharacterFixture(), characters: [] },
    })
    await view.get(`[data-node-id="${fixtureStarId('prayer_road.root')}"]`).trigger('click')
    expect(view.get('[aria-label="Выбранная звезда"]').text()).toBe('Неизвестно')
    expect(view.find('.embedded-knowledge').exists()).toBe(false)
    view.unmount()
})
it('places full-catalogue labels without overlapping at detailed scale', () => {
    const sky = constellationFixture(true)
    const labels = constellationLabels(
        sky,
        fixtureStarId('prayer.root'),
        true,
        1.25,
        sky.layout!.regions.prayer
    )
    expect(labels.length).toBeGreaterThan(0)
    for (const [index, a] of labels.entries())
        for (const b of labels.slice(index + 1))
            expect(
                a.x + a.width <= b.x ||
                    b.x + b.width <= a.x ||
                    a.y + a.height <= b.y ||
                    b.y + b.height <= a.y
            ).toBe(true)
})
