import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { BarFill } from './index'

it('preserves consumer sizing and accessibility while the fill color changes', async () => {
    const view = mount(BarFill, {
        props: { color: 'hsl(178 30% 42%)' },
        attrs: { class: 'custom-fill', style: { width: '35%' }, 'aria-hidden': 'true' },
    })
    try {
        expect(view.element.tagName).toBe('SPAN')
        expect(view.classes()).toContain('custom-fill')
        expect(view.attributes('aria-hidden')).toBe('true')
        expect(view.attributes('role')).toBeUndefined()
        expect(view.element.style.getPropertyValue('--bar-fill-color')).toBe('hsl(178 30% 42%)')
        await view.setProps({ color: 'var(--custom-fill)', height: 18, shadow: false })
        expect(view.element.style.getPropertyValue('--bar-fill-color')).toBe('var(--custom-fill)')
        expect(view.element.style.getPropertyValue('--bar-fill-height')).toBe('18px')
        expect(view.element.style.width).toBe('35%')
        expect(view.attributes('data-shadow')).toBe('false')
    } finally {
        view.unmount()
    }
})
