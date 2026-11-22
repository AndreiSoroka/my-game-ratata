import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { ConstellationStarCard } from '@/entities/constellations'

import { constellationFixture } from '../testing/developmentFixture'

it('classifies every revealed star as an active or passive spell, including physical stars', () => {
    for (const node of constellationFixture(true).nodes) {
        const view = mount(ConstellationStarCard, { props: { node } })
        expect(view.get('.constellation-detail__type').text()).toBe(
            node.effectType === 'active' ? 'Активное заклинание' : 'Пассивный навык'
        )
        view.unmount()
    }
})
it('keeps a closed card to one word without type, effects or description', () => {
    const node = constellationFixture().nodes.find((node) => !node.unlocked)!
    const view = mount(ConstellationStarCard, { props: { node } })
    expect(view.text()).toBe('Неизвестно')
    expect(view.findAll('aside > :not([aria-hidden="true"])')).toHaveLength(1)
    view.unmount()
})
