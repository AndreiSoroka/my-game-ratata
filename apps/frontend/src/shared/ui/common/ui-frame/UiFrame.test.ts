import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { h, nextTick, ref } from 'vue'

import { type DarkPanelTheme, provideDarkPanelTheme } from '@/shared/ui/theme'

import { UiFrame } from './index'

it('keeps parchment decoration hidden from accessibility and leaves the default skin explicit', async () => {
    const frame = mount(UiFrame)
    expect(frame.attributes('aria-hidden')).toBe('true')
    expect(frame.classes()).not.toContain('game-frame--parchment')
    await frame.setProps({ skin: 'parchment' })
    expect(frame.classes()).toContain('game-frame--parchment')
    expect(frame.attributes('aria-hidden')).toBe('true')
    frame.unmount()
})

it('uses Shared outlines on dark windows and panels and supports hero theme overrides', async () => {
    const theme = ref<DarkPanelTheme>()
    const wrapper = mount({
        setup() {
            provideDarkPanelTheme(theme)
            return () =>
                h('div', [
                    h(UiFrame, { variant: 'window' }),
                    h(UiFrame, { variant: 'panel' }),
                    h(UiFrame, { variant: 'inset' }),
                    h(UiFrame, { variant: 'speech' }),
                    h(UiFrame, { skin: 'parchment' }),
                ])
        },
    })
    try {
        expect(
            wrapper
                .get('.game-frame--window [data-fantasy-border]')
                .attributes('data-fantasy-border')
        ).toBe('border-014')
        expect(
            wrapper
                .get('.game-frame--panel [data-fantasy-border]')
                .attributes('data-fantasy-border')
        ).toBe('border-015')
        expect(wrapper.find('.game-frame--inset [data-fantasy-border]').exists()).toBe(false)
        theme.value = { border: 'border-018', accent: '#cbb8e9', surface: '#24304ce8' }
        await nextTick()
        const borders = wrapper.findAll<HTMLElement>('[data-fantasy-border="border-018"]')
        expect(
            borders.map(({ element }) => element.style.getPropertyValue('--fantasy-border-size'))
        ).toEqual(['14px', '14px', '14px'])
        expect(wrapper.find('.game-frame--speech [data-fantasy-border]').exists()).toBe(false)
        expect(wrapper.find('.game-frame--parchment [data-fantasy-border]').exists()).toBe(false)
        expect(wrapper.get('.game-frame--window').attributes('aria-hidden')).toBe('true')
    } finally {
        wrapper.unmount()
    }
})
