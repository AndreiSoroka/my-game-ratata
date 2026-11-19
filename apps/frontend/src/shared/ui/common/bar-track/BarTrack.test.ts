import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { BarTrack } from './index'

it('keeps a native div, consumer attributes/events and arbitrary slotted content', async () => {
    const onClick = vi.fn<(event: MouseEvent) => void>()
    const view = mount(BarTrack, {
        attrs: { id: 'track', class: 'consumer-size', 'aria-label': 'Подложка', onClick },
        slots: { default: '<span>Содержимое</span>' },
    })
    try {
        expect(view.element.tagName).toBe('DIV')
        expect(view.classes()).toContain('consumer-size')
        expect(view.attributes('id')).toBe('track')
        expect(view.attributes('role')).toBeUndefined()
        expect(view.attributes('aria-label')).toBe('Подложка')
        expect(view.get('.bar-track__content').text()).toBe('Содержимое')
        expect(view.attributes('data-shadow')).toBe('true')
        await view.get('span').trigger('click')
        expect(onClick).toHaveBeenCalledTimes(1)
    } finally {
        view.unmount()
    }
})

it('reacts to any CSS color, height and shadow without recoloring the slot', async () => {
    const view = mount(BarTrack, {
        props: { color: 'rgba(20, 30, 40, .5)' },
        slots: { default: '<span style="color: blue">Синий</span>' },
    })
    try {
        expect(view.element.style.getPropertyValue('--bar-track-color')).toBe(
            'rgba(20, 30, 40, .5)'
        )
        expect(view.element.style.getPropertyValue('--bar-track-height')).toBe('24px')
        await view.setProps({ color: 'var(--custom-track)', height: 34, shadow: false })
        expect(view.element.style.getPropertyValue('--bar-track-color')).toBe('var(--custom-track)')
        expect(view.element.style.getPropertyValue('--bar-track-height')).toBe('34px')
        expect(view.attributes('data-shadow')).toBe('false')
        expect(view.get('span').attributes('style')).toBe('color: blue;')
    } finally {
        view.unmount()
    }
})

it.each([
    { height: -4, expected: '8px' },
    { height: 0, expected: '8px' },
    { height: Number.NaN, expected: '24px' },
    { height: Number.POSITIVE_INFINITY, expected: '24px' },
])('keeps a usable track for height $height', ({ height, expected }) => {
    const view = mount(BarTrack, { props: { height } })
    try {
        expect(view.element.style.getPropertyValue('--bar-track-height')).toBe(expected)
    } finally {
        view.unmount()
    }
})
