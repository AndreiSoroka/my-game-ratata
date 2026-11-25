import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture } from '../../../game/testing/characterFixture'
import DeathOverlay from './DeathOverlay.vue'

it('explains final consequences and requires intentional keyboard focus before abandoning', async () => {
    const character = characterFixture('downed', {
        alive: false,
        life: { retired: false, reviveMsLeft: 59000, reviveUntil: 60000 },
    })
    const wrapper = mount(DeathOverlay, {
        props: { character, defeated: false },
        attachTo: document.body,
    })
    try {
        expect(wrapper.get('.death-overlay__countdown').text()).toContain('59')
        expect(wrapper.text()).toContain('уже нельзя будет воскресить')
        expect(wrapper.text()).toContain('Вещи и золото останутся в его теле')
        expect(document.activeElement).toBe(wrapper.get('.death-overlay__card').element)
        await wrapper
            .get('.death-overlay__card')
            .trigger('keydown', { code: 'Enter', repeat: true })
        expect(wrapper.emitted('abandonLife')).toBeUndefined()
        await wrapper.get('.death-overlay__card').trigger('keydown', { code: 'Tab' })
        expect(document.activeElement).toBe(wrapper.get('button').element)
        await wrapper.get('button').trigger('keydown', { code: 'Enter', repeat: true })
        expect(wrapper.emitted('abandonLife')).toBeUndefined()
        await wrapper.get('button').trigger('keydown', { code: 'Enter' })
        expect(wrapper.emitted('abandonLife')).toHaveLength(1)
        await wrapper.setProps({ pending: true })
        expect(wrapper.get('button').text()).toBe('Завершаем жизнь…')
        expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    } finally {
        wrapper.unmount()
    }
})
