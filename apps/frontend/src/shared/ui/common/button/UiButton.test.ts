import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import type { FantasyBorderVariant } from '@/shared/ui/external/fantasy-ui-borders/border'
import { lightUiColors } from '@/shared/ui/theme'

import { uiButtonColors } from './buttonColors'
import { UiButton } from './index'

it('keeps a native button, slotted content and arbitrary native attributes/listeners', async () => {
    const onClick = vi.fn<(event: MouseEvent) => void>()
    const onKeydown = vi.fn<(event: KeyboardEvent) => void>()
    const view = mount(UiButton, {
        attrs: {
            id: 'resume-action',
            name: 'action',
            value: 'resume',
            form: 'settings',
            class: 'menu-layout',
            style: { width: '240px' },
            'data-dialog-action': 'resume',
            'aria-label': 'Продолжить игру',
            onClick,
            onKeydown,
        },
        slots: { default: '<strong>Вернуться</strong> в игру' },
    })
    try {
        expect(view.element.tagName).toBe('BUTTON')
        expect(view.attributes('type')).toBe('button')
        expect(view.attributes('id')).toBe('resume-action')
        expect(view.attributes('name')).toBe('action')
        expect(view.attributes('value')).toBe('resume')
        expect(view.attributes('form')).toBe('settings')
        expect(view.attributes('aria-label')).toBe('Продолжить игру')
        expect(view.attributes('data-dialog-action')).toBe('resume')
        expect(view.classes()).toContain('menu-layout')
        expect(view.element.style.width).toBe('240px')
        expect(view.get('strong').text()).toBe('Вернуться')
        await view.get('strong').trigger('click')
        await view.trigger('keydown', { key: 'Enter', code: 'Enter' })
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(onClick.mock.calls[0]![0].target).toBe(view.get('strong').element)
        expect(onKeydown).toHaveBeenCalledTimes(1)
        expect(onKeydown.mock.calls[0]![0].defaultPrevented).toBe(false)
    } finally {
        view.unmount()
    }
})

it('composes an inaccessible span outline without block children or nested buttons', () => {
    const view = mount(UiButton, { slots: { default: 'Закрыть' } })
    try {
        const border = view.get('[data-fantasy-border]')
        expect(border.element.tagName).toBe('SPAN')
        expect(border.attributes('aria-hidden')).toBe('true')
        expect(border.attributes('data-fantasy-border')).toBe('border-026')
        expect(border.get('feFlood').attributes('style')).toContain('--ui-button-current-border')
        expect(view.find('div').exists()).toBe(false)
        expect(view.element.querySelector('button')).toBeNull()
        expect(border.get('svg').attributes('focusable')).toBe('false')
        expect(view.get('.ui-button__content').text()).toBe('Закрыть')
    } finally {
        view.unmount()
    }
})

it('retains native disabled and form button types', async () => {
    const onClick = vi.fn<(event: MouseEvent) => void>()
    const view = mount(UiButton, { props: { disabled: true, type: 'submit' }, attrs: { onClick } })
    try {
        expect(view.element.disabled).toBe(true)
        expect(view.element.type).toBe('submit')
        view.element.click()
        expect(onClick).not.toHaveBeenCalled()
        await view.setProps({ disabled: false, type: 'reset' })
        view.element.click()
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(view.element.type).toBe('reset')
    } finally {
        view.unmount()
    }
})

it('distinguishes missing highlighted from explicitly controlled false', async () => {
    const view = mount(UiButton, { props: { appearance: 'ghost' } })
    try {
        expect(view.attributes('data-highlight-managed')).toBe('false')
        expect(view.attributes('data-highlighted')).toBeUndefined()
        expect(view.element.style.getPropertyValue('--ui-button-normal-top')).toBe('transparent')
        await view.setProps({ highlighted: false })
        expect(view.attributes('data-highlight-managed')).toBe('true')
        expect(view.attributes('data-highlighted')).toBe('false')
        await view.setProps({ highlighted: true })
        expect(view.attributes('data-highlighted')).toBe('true')
        await view.setProps({ highlighted: undefined })
        expect(view.attributes('data-highlight-managed')).toBe('false')
        expect(view.attributes('data-highlighted')).toBeUndefined()
    } finally {
        view.unmount()
    }
})

it('can suppress only the focus ring without changing native focus or highlight ownership', async () => {
    const view = mount(UiButton, { attachTo: document.body })
    try {
        expect(view.attributes('data-focus-ring')).toBe('true')
        view.element.focus()
        expect(document.activeElement).toBe(view.element)
        await view.setProps({ focusRing: false })
        expect(view.attributes('data-focus-ring')).toBe('false')
        expect(view.attributes('data-highlight-managed')).toBe('false')
        expect(view.attributes('tabindex')).toBeUndefined()
        expect(document.activeElement).toBe(view.element)
        await view.setProps({ focusRing: true })
        expect(view.attributes('data-focus-ring')).toBe('true')
        expect(document.activeElement).toBe(view.element)
    } finally {
        view.unmount()
    }
})

it('updates border artwork and all supplied CSS color states reactively', async () => {
    const view = mount(UiButton)
    try {
        await view.setProps({
            border: 'border-020',
            colors: {
                normal: {
                    text: 'red',
                    border: 'rgba(20, 30, 40, .5)',
                    backgroundTop: 'var(--ocean)',
                    backgroundBottom: '#123456',
                },
                highlighted: {
                    text: 'rgb(255 240 210)',
                    border: 'currentColor',
                    backgroundTop: 'hsl(210 30% 30%)',
                },
                pressed: { border: 'var(--pressed)', backgroundBottom: '#010203' },
                edge: '#222222',
                shadow: 'rgba(0, 0, 0, 0.3)',
                pressedShadow: 'purple',
                focus: 'orange',
            },
        })
        expect(view.get('[data-fantasy-border]').attributes('data-fantasy-border')).toBe(
            'border-020'
        )
        expect(view.element.style.getPropertyValue('--ui-button-normal-text')).toBe('red')
        expect(view.element.style.getPropertyValue('--ui-button-border-corner')).toBe('20px')
        expect(view.element.style.getPropertyValue('--ui-button-border-edge')).toBe('2px')
        expect(view.element.style.getPropertyValue('--ui-button-normal-border')).toBe(
            'rgba(20, 30, 40, .5)'
        )
        expect(view.element.style.getPropertyValue('--ui-button-normal-top')).toBe('var(--ocean)')
        expect(view.element.style.getPropertyValue('--ui-button-highlighted-border')).toBe(
            'currentColor'
        )
        expect(view.element.style.getPropertyValue('--ui-button-pressed-bottom')).toBe('#010203')
        expect(view.element.style.getPropertyValue('--ui-button-edge')).toBe('#222222')
        expect(view.element.style.getPropertyValue('--ui-button-shadow')).toBe('rgba(0, 0, 0, 0.3)')
        expect(view.element.style.getPropertyValue('--ui-button-pressed-shadow')).toBe('purple')
        expect(view.element.style.getPropertyValue('--ui-button-focus')).toBe('orange')
    } finally {
        view.unmount()
    }
})

it('supports every original border through the public component API', async () => {
    const view = mount(UiButton)
    try {
        for (let index = 0; index < 32; index += 1) {
            const border = `border-${String(index).padStart(3, '0')}` as FantasyBorderVariant
            await view.setProps({ border })
            expect(view.get('[data-fantasy-border]').attributes('data-fantasy-border')).toBe(border)
        }
        await view.setProps({ border: 'border-024' })
        expect(view.element.style.getPropertyValue('--ui-button-border-edge')).toBe('14px')
    } finally {
        view.unmount()
    }
})

it('keeps toggle state independent of transient presentation', () => {
    const view = mount(UiButton, {
        props: { appearance: 'ghost' },
        attrs: { 'aria-pressed': true },
    })
    try {
        expect(view.attributes('aria-pressed')).toBe('true')
        expect(view.attributes('data-highlighted')).toBeUndefined()
        expect(view.classes()).toContain('ui-button--ghost')
        expect(view.element.style.getPropertyValue('--ui-button-normal-top')).toBe('transparent')
    } finally {
        view.unmount()
    }
})

it('keeps a custom ghost highlight palette during pressing without inheriting dark idle text', () => {
    const colors = uiButtonColors({
        appearance: 'ghost',
        colors: {
            normal: { text: '#51356b', border: 'rgba(90, 55, 120, 0.8)' },
            highlighted: {
                border: '#ead9ff',
                backgroundTop: '#705086',
                backgroundBottom: '#51356b',
            },
        },
    })
    expect(colors['--ui-button-normal-top']).toBe('transparent')
    expect(colors['--ui-button-pressed-top']).toBe('#51356b')
    expect(colors['--ui-button-pressed-bottom']).toBe('#705086')
    expect(colors['--ui-button-pressed-border']).toBe('#ead9ff')
    expect(colors['--ui-button-highlighted-text']).toBe(lightUiColors.button.textHover)
    expect(colors['--ui-button-pressed-text']).toBe(lightUiColors.button.textHover)
})

it('inherits normal custom fill through hover and pressing while explicit pressed fields win', () => {
    const colors = uiButtonColors({
        colors: {
            normal: { backgroundTop: 'var(--ocean)', backgroundBottom: 'rgb(5 20 80)' },
            highlighted: { text: 'currentColor', border: 'hsl(210 80% 85%)' },
            pressed: { backgroundBottom: 'rgba(20, 40, 80, 0.8)', border: 'var(--pressed)' },
        },
    })
    expect(colors['--ui-button-highlighted-top']).toBe('var(--ocean)')
    expect(colors['--ui-button-highlighted-bottom']).toBe('rgb(5 20 80)')
    expect(colors['--ui-button-pressed-top']).toBe('rgb(5 20 80)')
    expect(colors['--ui-button-pressed-bottom']).toBe('rgba(20, 40, 80, 0.8)')
    expect(colors['--ui-button-pressed-text']).toBe('currentColor')
    expect(colors['--ui-button-pressed-border']).toBe('var(--pressed)')
})

it.each(['secondary', 'primary', 'success', 'danger'] as const)(
    'preserves %s preset gradients for both filled and transparent buttons',
    (variant) => {
        const palette =
            variant === 'secondary' ? lightUiColors.button.wood : lightUiColors.button[variant]
        for (const appearance of ['filled', 'ghost'] as const) {
            const colors = uiButtonColors({ variant, appearance })
            expect(colors['--ui-button-normal-top']).toBe(
                appearance === 'ghost' ? 'transparent' : palette.top
            )
            expect(colors['--ui-button-highlighted-top']).toBe(palette.hoverTop)
            expect(colors['--ui-button-highlighted-bottom']).toBe(palette.hoverBottom)
            expect(colors['--ui-button-pressed-top']).toBe(palette.bottom)
            expect(colors['--ui-button-pressed-bottom']).toBe(palette.top)
        }
    }
)
