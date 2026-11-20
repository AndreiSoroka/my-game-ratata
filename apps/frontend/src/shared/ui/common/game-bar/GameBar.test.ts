import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { BarFill } from '@/shared/ui/common/bar-fill'
import { BarTrack } from '@/shared/ui/common/bar-track'

import { GameBar } from './index'

it('composes an accessible native progressbar with independently colored track and fill', async () => {
    const onClick = vi.fn<(event: MouseEvent) => void>()
    const view = mount(GameBar, {
        props: { value: 30, max: 60, label: 'Мана', color: '#3366cc', trackColor: '#223344' },
        attrs: { id: 'mana', class: 'resource-layout', onClick },
    })
    try {
        expect(view.element.tagName).toBe('DIV')
        expect(view.classes()).toContain('resource-layout')
        expect(view.attributes('role')).toBe('progressbar')
        expect(view.attributes('aria-label')).toBe('Мана')
        expect(view.attributes('aria-valuemin')).toBe('0')
        expect(view.attributes('aria-valuemax')).toBe('60')
        expect(view.attributes('aria-valuenow')).toBe('30')
        expect(view.element.style.getPropertyValue('--game-bar-percent')).toBe('50%')
        expect(view.getComponent(BarFill).props('color')).toBe('#3366cc')
        expect(view.getComponent(BarTrack).props('color')).toBe('#223344')
        expect(view.get('.game-bar__fill').attributes('aria-hidden')).toBe('true')
        expect(view.find('.game-bar__label').exists()).toBe(false)
        await view.get('.game-bar__fill').trigger('click')
        expect(onClick).toHaveBeenCalledTimes(1)
    } finally {
        view.unmount()
    }
})

it.each([
    { value: 0, max: 100, current: '0', maximum: '100', percent: '0%', empty: true },
    { value: 1, max: 100, current: '1', maximum: '100', percent: '1%', empty: false },
    { value: 100, max: 100, current: '100', maximum: '100', percent: '100%', empty: false },
    { value: 120, max: 80, current: '80', maximum: '80', percent: '100%', empty: false },
    { value: -12, max: 100, current: '0', maximum: '100', percent: '0%', empty: true },
    { value: Number.NaN, max: 100, current: '0', maximum: '100', percent: '0%', empty: true },
    {
        value: Number.POSITIVE_INFINITY,
        max: 100,
        current: '0',
        maximum: '100',
        percent: '0%',
        empty: true,
    },
    { value: 25, max: 0, current: '25', maximum: '100', percent: '25%', empty: false },
    { value: 25, max: -20, current: '25', maximum: '100', percent: '25%', empty: false },
    { value: 25, max: Number.NaN, current: '25', maximum: '100', percent: '25%', empty: false },
])(
    'normalizes $value / $max without inventing a minimum filled cap',
    ({ value, max, current, maximum, percent, empty }) => {
        const view = mount(GameBar, { props: { value, max }, attachTo: document.body })
        try {
            expect(view.attributes('aria-valuenow')).toBe(current)
            expect(view.attributes('aria-valuemax')).toBe(maximum)
            expect(view.element.style.getPropertyValue('--game-bar-percent')).toBe(percent)
            expect(view.get('.game-bar__fill').isVisible()).toBe(!empty)
        } finally {
            view.unmount()
        }
    }
)

it('reacts to value, colors, height and shadows and renders optional values inside the track', async () => {
    const view = mount(GameBar, { props: { value: 25, showValue: true } })
    try {
        expect(view.get('.game-bar__label').text()).toBe('25 / 100')
        expect(view.get('.bar-track__content .game-bar__label').text()).toBe('25 / 100')
        await view.setProps({
            value: 10,
            max: 20,
            color: 'var(--fill)',
            trackColor: 'currentColor',
            textColor: 'purple',
            height: 34,
            shadow: false,
        })
        expect(view.attributes('aria-valuenow')).toBe('10')
        expect(view.element.style.getPropertyValue('--game-bar-percent')).toBe('50%')
        expect(view.getComponent(BarFill).props('color')).toBe('var(--fill)')
        expect(view.element.style.getPropertyValue('--game-bar-text-color')).toBe('purple')
        expect(view.get('.game-bar__label').text()).toBe('10 / 20')
        const track = view.get('.bar-track')
        expect((track.element as HTMLElement).style.getPropertyValue('--bar-track-color')).toBe(
            'currentColor'
        )
        expect((track.element as HTMLElement).style.getPropertyValue('--bar-track-height')).toBe(
            '34px'
        )
        expect(view.attributes('data-shadow')).toBe('false')
        expect(track.attributes('data-shadow')).toBe('false')
        expect(view.getComponent(BarFill).props('shadow')).toBe(false)
    } finally {
        view.unmount()
    }
})

it('allows a consumer label in the default slot instead of built-in numbers', () => {
    const view = mount(GameBar, { props: { value: 55 }, slots: { default: 'Ещё немного' } })
    try {
        expect(view.get('.game-bar__label').text()).toBe('Ещё немного')
    } finally {
        view.unmount()
    }
})
