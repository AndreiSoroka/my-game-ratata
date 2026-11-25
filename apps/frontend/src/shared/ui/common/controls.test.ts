import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import { ItemSlot, UiButton, UiInput, UiSelect, UiTextarea } from './index'

it.each(['default', 'small', 'compact'] as const)(
    '%s button size preserves native events and disabled',
    async (size) => {
        const wrapper = mount(UiButton, {
            props: { variant: 'primary', size },
            attrs: { 'aria-label': 'Предложить', 'data-dialog-action': '', disabled: true },
            slots: { default: 'Предложить' },
        })
        expect(wrapper.element.tagName).toBe('BUTTON')
        expect(wrapper.attributes('type')).toBe('button')
        expect(wrapper.attributes('aria-label')).toBe('Предложить')
        await wrapper.trigger('click')
        expect(wrapper.emitted('click')).toBeUndefined()
        await wrapper.setProps({ disabled: false, type: 'submit' })
        await wrapper.trigger('click')
        expect(wrapper.emitted('click')).toHaveLength(1)
        expect(wrapper.emitted('click')![0]![0]).toBeInstanceOf(MouseEvent)
        expect(wrapper.attributes('type')).toBe('submit')
        wrapper.unmount()
    }
)

it('keeps controlled value edits and native input/blur events intact', async () => {
    const onInput = vi.fn<(event: Event) => void>()
    const onBlur = vi.fn<(event: Event) => void>()
    const wrapper = mount(UiInput, {
        attrs: {
            value: 2,
            type: 'number',
            min: 0,
            max: 9,
            'aria-label': 'Количество',
            onInput,
            onBlur,
        },
    })
    const input = wrapper.get('input')
    expect(input.element.value).toBe('2')
    await input.setValue('7')
    await input.trigger('blur')
    const event = onInput.mock.calls[0]![0] as InputEvent
    expect(event.target).toBe(input.element)
    expect(onInput).toHaveBeenCalledTimes(1)
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    const value = ref(4)
    const controlled = mount({ setup: () => () => h(UiInput, { value: value.value }) })
    expect(controlled.get('input').element.value).toBe('4')
    value.value = 5
    await nextTick()
    expect(controlled.get('input').element.value).toBe('5')
    controlled.unmount()
    wrapper.unmount()
})

it('preserves number, checkbox and radio v-model semantics', async () => {
    const host = mount(
        defineComponent({
            components: { UiInput },
            data: () => ({ quantity: 2, enabled: false, choice: 'first' }),
            template: `<div>
                <UiInput v-model.number="quantity" type="number" aria-label="quantity" />
                <UiInput v-model="enabled" type="checkbox" />
                <UiInput v-model="choice" type="radio" value="first" />
                <UiInput v-model="choice" type="radio" value="second" />
            </div>`,
        })
    )
    await host.get('input[type="number"]').setValue('8')
    expect(host.vm.quantity).toBe(8)
    await host.get('input[type="checkbox"]').setValue(true)
    expect(host.vm.enabled).toBe(true)
    expect((host.get('input[value="first"]').element as HTMLInputElement).checked).toBe(true)
    await host.get('input[value="second"]').setValue(true)
    expect(host.vm.choice).toBe('second')
    expect((host.get('input[value="first"]').element as HTMLInputElement).checked).toBe(false)
    host.unmount()
})

it('does not commit unfinished IME composition to a text model', async () => {
    const host = mount(
        defineComponent({
            components: { UiInput },
            data: () => ({ message: '' }),
            template: '<UiInput v-model="message" />',
        })
    )
    const input = host.get('input')
    await input.trigger('compositionstart')
    ;(input.element as HTMLInputElement).value = 'Привет'
    await input.trigger('input')
    expect(host.vm.message).toBe('')
    await input.trigger('compositionend')
    expect(host.vm.message).toBe('Привет')
    host.unmount()
})

it('preserves lazy trim/number edits and checkbox collections', async () => {
    const host = mount(
        defineComponent({
            components: { UiInput, UiSelect },
            data: () => ({
                text: 'one',
                amount: 2,
                checked: ['apple'],
                selected: [1],
                numberChoice: 1,
            }),
            template: `<div>
                <UiInput v-model.lazy.trim="text" aria-label="text" />
                <UiInput v-model.lazy.number="amount" aria-label="amount" />
                <UiInput v-model="checked" type="checkbox" value="apple" />
                <UiInput v-model="checked" type="checkbox" value="grain" />
                <UiSelect v-model="selected" multiple><option :value="1">Один</option><option :value="2">Два</option></UiSelect>
                <UiSelect v-model.number="numberChoice"><option value="1">Один</option><option value="2">Два</option></UiSelect>
            </div>`,
        })
    )
    const text = host.get('input[aria-label="text"]')
    ;(text.element as HTMLInputElement).value = '  changed  '
    await text.trigger('input')
    expect(host.vm.text).toBe('one')
    await text.trigger('change')
    expect(host.vm.text).toBe('changed')
    const amount = host.get('input[aria-label="amount"]')
    ;(amount.element as HTMLInputElement).value = '7'
    await amount.trigger('input')
    expect(host.vm.amount).toBe(2)
    await amount.trigger('change')
    expect(host.vm.amount).toBe(7)
    await host.get('input[value="grain"]').setValue(true)
    expect(host.vm.checked).toEqual(['apple', 'grain'])
    await host.get('input[value="apple"]').setValue(false)
    expect(host.vm.checked).toEqual(['grain'])
    await host.get('select[multiple]').setValue(['1', '2'])
    expect(host.vm.selected).toEqual([1, 2])
    await host.get('select:not([multiple])').setValue('2')
    expect(host.vm.numberChoice).toBe(2)
    host.unmount()
})

it('supports select and textarea models without replacing their native targets', async () => {
    const host = mount(
        defineComponent({
            components: { UiSelect, UiTextarea },
            data: () => ({ selection: 'one', message: 'Черновик' }),
            template: `<div>
                <UiSelect v-model="selection"><option value="one">Один</option><option value="two">Два</option></UiSelect>
                <UiTextarea v-model="message" maxlength="400" />
            </div>`,
        })
    )
    await host.get('select').setValue('two')
    expect(host.vm.selection).toBe('two')
    await host.get('textarea').setValue('Сообщение')
    expect(host.vm.message).toBe('Сообщение')
    expect(host.get('textarea').attributes('maxlength')).toBe('400')
    host.unmount()
})

it('keeps item slots native and quantity decoration out of accessible content', async () => {
    const wrapper = mount(ItemSlot, {
        props: { as: 'button', selected: true, quantity: 3 },
        attrs: { 'aria-label': 'Яблоко × 3', 'data-item-instance-id': 'apple-1' },
    })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.element.querySelector('button')).toBeNull()
    expect(wrapper.attributes('data-item-instance-id')).toBe('apple-1')
    expect(wrapper.get('.ui-item-slot__quantity').attributes('aria-hidden')).toBe('true')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    wrapper.unmount()
})
