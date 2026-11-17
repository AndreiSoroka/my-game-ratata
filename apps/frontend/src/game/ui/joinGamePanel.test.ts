import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import JoinGamePanel from './JoinGamePanel.vue'

it('offers four named native radio cards and updates the background description', async () => {
    const wrapper = mount(JoinGamePanel, {
        props: { nickname: 'Hero', heroClass: 'vanguard', canJoin: true, errorMessage: '' },
    })
    try {
        expect(wrapper.findAll('input[type="radio"]')).toHaveLength(4)
        expect(wrapper.findAll('.class-card svg')).toHaveLength(4)
        expect(wrapper.find('select').exists()).toBe(false)
        expect(wrapper.get('#hero-class').attributes('value')).toBe('vanguard')
        await wrapper.get('input[value="ranger"]').setValue()
        expect(wrapper.emitted('update:heroClass')?.at(-1)).toEqual(['ranger'])
        await wrapper.setProps({ heroClass: 'ranger' })
        expect(wrapper.get('#hero-class').attributes('value')).toBe('ranger')
        expect(wrapper.get('#class-description').text()).toContain('Опыт странствий')
    } finally {
        wrapper.unmount()
    }
})
