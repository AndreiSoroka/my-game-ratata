import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { constellationFixture } from '../testing/developmentFixture'
import ConstellationStarCard from './ConstellationStarCard.vue'

it('classifies every revealed star as an active or passive spell, including physical stars', () => {
    for (const node of constellationFixture(true).nodes) {
        const view = mount(ConstellationStarCard, { props: { node } })
        expect(view.get('.constellation-detail__type').text()).toBe(
            node.effectType === 'active' ? 'Активное заклинание' : 'Пассивное заклинание'
        )
        view.unmount()
    }
})
it('keeps a closed card to one word without type, effects or description', () => {
    const node = constellationFixture().nodes.find((node) => !node.unlocked)!
    const view = mount(ConstellationStarCard, { props: { node } })
    expect(view.text()).toBe('Неизвестно')
    expect(view.findAll('aside > *')).toHaveLength(1)
    view.unmount()
})
