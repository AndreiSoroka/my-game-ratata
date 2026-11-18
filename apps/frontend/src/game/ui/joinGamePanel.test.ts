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

it('keeps native name edits separate from regeneration and from submitting the form', async () => {
    const wrapper = mount(JoinGamePanel, {
        props: { nickname: 'Элвин Зорек', heroClass: 'vanguard', canJoin: true, errorMessage: '' },
    })
    try {
        expect(wrapper.get('form').attributes('autocomplete')).toBe('off')
        const name = wrapper.get('#nickname')
        expect(name.attributes('autocomplete')).toBe('off')
        expect(name.attributes('maxlength')).toBe('24')
        expect(wrapper.get('label[for="nickname"]').text()).toBe('Имя героя')
        const regenerate = wrapper.get('[aria-label="Сгенерировать другое имя"]')
        expect(regenerate.attributes('type')).toBe('button')
        await regenerate.trigger('click')
        expect(wrapper.emitted('regenerate-name')).toEqual([[]])
        expect(wrapper.emitted('join')).toBeUndefined()
        expect(wrapper.emitted('nickname-edited')).toBeUndefined()
        await name.setValue('Моё имя')
        expect(wrapper.emitted('update:nickname')?.at(-1)).toEqual(['Моё имя'])
        expect(wrapper.emitted('nickname-edited')).toEqual([[]])
        await wrapper.get('input[value="ranger"]').setValue()
        expect(wrapper.emitted('nickname-edited')).toHaveLength(1)
        expect(wrapper.get('button[type="submit"]').text()).toBe('Войти')
    } finally {
        wrapper.unmount()
    }
})
