import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import GameButton from './GameButton.vue'
import GameInput from './GameInput.vue'
import GameItemSlot from './GameItemSlot.vue'
import GameSelect from './GameSelect.vue'
import GameTextarea from './GameTextarea.vue'

it('forwards button attributes and exactly one native event, and respects disabled', async () => {
    const wrapper = mount(GameButton, {
        props: { variant: 'primary' },
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
})

it('keeps controlled value edits and native input/blur events intact', async () => {
    const onInput = vi.fn<(event: Event) => void>()
    const onBlur = vi.fn<(event: Event) => void>()
    const wrapper = mount(GameInput, {
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
    expect(wrapper.element.tagName).toBe('INPUT')
    expect(wrapper.element.value).toBe('2')
    await wrapper.get('input').setValue('7')
    await wrapper.trigger('blur')
    const event = onInput.mock.calls[0]![0] as InputEvent
    expect(event.target).toBe(wrapper.element)
    expect(onInput).toHaveBeenCalledTimes(1)
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.setProps({ value: 4 })
    expect(wrapper.element.value).toBe('4')
    wrapper.unmount()
})

it('preserves number, checkbox and radio v-model semantics', async () => {
    const host = mount(
        defineComponent({
            components: { GameInput },
            data: () => ({ quantity: 2, enabled: false, choice: 'first' }),
            template: `<div>
                <GameInput v-model.number="quantity" type="number" aria-label="quantity" />
                <GameInput v-model="enabled" type="checkbox" />
                <GameInput v-model="choice" type="radio" value="first" />
                <GameInput v-model="choice" type="radio" value="second" />
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
            components: { GameInput },
            data: () => ({ message: '' }),
            template: '<GameInput v-model="message" />',
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
            components: { GameInput, GameSelect },
            data: () => ({
                text: 'one',
                amount: 2,
                checked: ['apple'],
                selected: [1],
                numberChoice: 1,
            }),
            template: `<div>
                <GameInput v-model.lazy.trim="text" aria-label="text" />
                <GameInput v-model.lazy.number="amount" aria-label="amount" />
                <GameInput v-model="checked" type="checkbox" value="apple" />
                <GameInput v-model="checked" type="checkbox" value="grain" />
                <GameSelect v-model="selected" multiple><option :value="1">Один</option><option :value="2">Два</option></GameSelect>
                <GameSelect v-model.number="numberChoice"><option value="1">Один</option><option value="2">Два</option></GameSelect>
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
            components: { GameSelect, GameTextarea },
            data: () => ({ selection: 'one', message: 'Черновик' }),
            template: `<div>
                <GameSelect v-model="selection"><option value="one">Один</option><option value="two">Два</option></GameSelect>
                <GameTextarea v-model="message" maxlength="400" />
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
    const wrapper = mount(GameItemSlot, {
        props: { as: 'button', selected: true, quantity: 3 },
        attrs: { 'aria-label': 'Яблоко × 3', 'data-item-instance-id': 'apple-1' },
    })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.element.querySelector('button')).toBeNull()
    expect(wrapper.attributes('data-item-instance-id')).toBe('apple-1')
    expect(wrapper.get('.game-item-slot__quantity').attributes('aria-hidden')).toBe('true')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    wrapper.unmount()
})
