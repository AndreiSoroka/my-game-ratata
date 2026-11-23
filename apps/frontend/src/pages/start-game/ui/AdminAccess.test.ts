import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import AdminAccess from './AdminAccess.vue'

it('submits one four-character code, clears it and focuses Admin after approval', async () => {
    const wrapper = mount(AdminAccess, {
        attachTo: document.body,
        props: { access: 'code', busy: false, error: '' },
    })
    try {
        const code = wrapper.get<HTMLInputElement>('input')
        expect(wrapper.get('button').element.disabled).toBe(true)
        await code.setValue('ab12')
        await wrapper.get('form').trigger('submit')
        expect(wrapper.emitted('code')).toEqual([['AB12']])
        expect(code.element.value).toBe('')
        await wrapper.setProps({ busy: false, error: 'Код не принят.' })
        expect(wrapper.get('[role="alert"]').text()).toBe('Код не принят.')
        await wrapper.setProps({ access: 'authorized', error: '' })
        const admin = wrapper.get<HTMLButtonElement>('button')
        expect(admin.text()).toBe('Admin')
        expect(document.activeElement).toBe(admin.element)
        await admin.trigger('click')
        expect(wrapper.emitted('open')).toEqual([[]])
    } finally {
        wrapper.unmount()
    }
})
