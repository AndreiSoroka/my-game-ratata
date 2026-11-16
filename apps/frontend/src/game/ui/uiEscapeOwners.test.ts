import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import { useEscapeOwner } from './uiEscapeOwners'

const escape = (repeat = false) =>
    new KeyboardEvent('keydown', {
        code: 'Escape',
        key: 'Escape',
        bubbles: true,
        cancelable: true,
        repeat,
    })
it('closes one visible owner before the menu fallback and never opens it on a held Escape', async () => {
    const fallback = vi.fn<() => void>()
    const component = defineComponent({
        setup() {
            const open = ref(true),
                panel = ref<HTMLElement>()
            useEscapeOwner({
                active: () => open.value,
                element: panel,
                escape: () => {
                    open.value = false
                },
            })
            useEscapeOwner({ active: () => true, priority: -100, escape: fallback })
            return { open, panel }
        },
        template: '<section v-if="open" ref="panel" role="dialog">Inventory</section>',
    })
    const wrapper = mount(component, { attachTo: document.body })
    try {
        const first = escape()
        document.body.dispatchEvent(first)
        await flushPromises()
        expect(first.defaultPrevented).toBe(true)
        expect(wrapper.find('section').exists()).toBe(false)
        document.body.dispatchEvent(escape(true))
        expect(fallback).not.toHaveBeenCalled()
        document.body.dispatchEvent(escape())
        expect(fallback).toHaveBeenCalledOnce()
    } finally {
        wrapper.unmount()
    }
    const after = escape()
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
})
it('preserves an unrelated input owner and gives higher-priority UI the background Escape', () => {
    const lower = vi.fn<() => void>(),
        upper = vi.fn<() => void>()
    const wrapper = mount(
        defineComponent({
            setup() {
                useEscapeOwner({ active: () => true, escape: lower })
                useEscapeOwner({ active: () => true, escape: upper, priority: 200 })
                return () => null
            },
        })
    )
    const input = document.createElement('input')
    document.body.append(input)
    try {
        input.focus()
        const event = escape()
        input.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
        expect(upper).not.toHaveBeenCalled()
        input.remove()
        document.body.dispatchEvent(escape())
        expect(upper).toHaveBeenCalledOnce()
        expect(lower).not.toHaveBeenCalled()
    } finally {
        input.remove()
        wrapper.unmount()
    }
})

it('prioritizes menu or chat over a focused lower-priority window', () => {
    const lower = vi.fn<() => void>(),
        upper = vi.fn<() => void>()
    const wrapper = mount(
        defineComponent({
            setup() {
                const panel = ref<HTMLElement>()
                useEscapeOwner({ active: () => true, element: panel, escape: lower })
                useEscapeOwner({ active: () => true, escape: upper, priority: 150 })
                return { panel }
            },
            template: '<section ref="panel" role="dialog"><button>Inventory</button></section>',
        }),
        { attachTo: document.body }
    )
    try {
        const button = wrapper.get('button').element
        button.focus()
        button.dispatchEvent(escape())
        expect(upper).toHaveBeenCalledOnce()
        expect(lower).not.toHaveBeenCalled()
    } finally {
        wrapper.unmount()
    }
})

it('prefers a focused owner only among equal-priority windows', () => {
    const first = vi.fn<() => void>(),
        second = vi.fn<() => void>()
    const wrapper = mount(
        defineComponent({
            setup() {
                const panel = ref<HTMLElement>()
                useEscapeOwner({ active: () => true, element: panel, escape: first })
                useEscapeOwner({ active: () => true, escape: second })
                return { panel }
            },
            template: '<section ref="panel" role="dialog"><button>Inventory</button></section>',
        }),
        { attachTo: document.body }
    )
    try {
        const button = wrapper.get('button').element
        button.focus()
        button.dispatchEvent(escape())
        expect(first).toHaveBeenCalledOnce()
        expect(second).not.toHaveBeenCalled()
    } finally {
        wrapper.unmount()
    }
})
