import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { FANTASY_BORDER_VARIANTS, resolveFantasyBorder } from './borderVariants'
import { FantasyBorder, type FantasyBorderVariant } from './index'

it('keeps the default native div, arbitrary slot content and native attributes/events', async () => {
    const onClick = vi.fn<(event: MouseEvent) => void>()
    const view = mount(FantasyBorder, {
        attrs: {
            id: 'offer-frame',
            class: 'offer-layout',
            role: 'group',
            'aria-label': 'Предложение',
            tabindex: 0,
            onClick,
        },
        slots: { default: '<button type="button">Взять яблоко</button>' },
    })
    try {
        expect(view.element.tagName).toBe('DIV')
        expect(view.attributes('data-fantasy-border')).toBe('border-026')
        expect(view.attributes('id')).toBe('offer-frame')
        expect(view.classes()).toContain('offer-layout')
        expect(view.attributes('role')).toBe('group')
        expect(view.attributes('aria-label')).toBe('Предложение')
        expect(view.attributes('tabindex')).toBe('0')
        expect(view.get('feFlood').attributes('style')?.toLowerCase()).toContain('currentcolor')
        const button = view.get('button')
        await button.trigger('click')
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(onClick.mock.calls[0]![0].target).toBe(button.element)
        expect(view.get('svg').attributes('aria-hidden')).toBe('true')
        expect(view.get('svg').attributes('width')).toBe('0')
        expect(view.get('svg').attributes('height')).toBe('0')
        expect(view.get('svg').attributes('style') ?? '').not.toContain('display: none')
    } finally {
        view.unmount()
    }
})

it('updates only the border color filter and keeps slotted content unchanged', async () => {
    const view = mount(FantasyBorder, {
        props: { color: 'rgba(255, 0, 0, 0.5)' },
        attrs: { style: { color: 'rgb(0, 128, 0)' } },
        slots: { default: '<span style="color: rgb(0, 0, 255)">Синий текст</span>' },
    })
    try {
        expect(view.get('feFlood').attributes('style')).toContain('rgba(255, 0, 0, 0.5)')
        expect(view.get('filter').attributes('color-interpolation-filters')).toBe('sRGB')
        expect(view.get('feComposite').attributes('operator')).toBe('in')
        expect(view.get('feComposite').attributes('in2')).toBe('SourceAlpha')
        const before = view.get('span').html()
        await view.setProps({ color: 'var(--border-accent)' })
        expect(view.get('feFlood').attributes('style')).toContain('var(--border-accent)')
        expect(view.get('span').html()).toBe(before)
        expect((view.element as HTMLElement).style.color).toBe('rgb(0, 128, 0)')
        expect((view.element as HTMLElement).style.filter).toBe('')
    } finally {
        view.unmount()
    }
})

it('uses a distinct local filter identity across independent Vue applications', () => {
    const first = mount(FantasyBorder, { props: { color: 'red' } })
    const second = mount(FantasyBorder, { props: { color: 'blue' } })
    try {
        const firstId = first.get('filter').attributes('id')
        const secondId = second.get('filter').attributes('id')
        expect(firstId).toBeTruthy()
        expect(secondId).toBeTruthy()
        expect(firstId).not.toBe(secondId)
        expect(
            (first.element as HTMLElement).style.getPropertyValue('--fantasy-border-filter')
        ).toContain(`#${firstId}`)
        expect(
            (second.element as HTMLElement).style.getPropertyValue('--fantasy-border-filter')
        ).toContain(`#${secondId}`)
    } finally {
        first.unmount()
        second.unmount()
    }
})

it.each(['missing', '__proto__', 'constructor', 'toString', '', undefined])(
    'falls back safely for an untyped runtime border value %s',
    (border) => {
        expect(resolveFantasyBorder(border).key).toBe('border-026')
        const view = mount(FantasyBorder, {
            props: { border: border as FantasyBorderVariant | undefined },
        })
        try {
            expect(view.attributes('data-fantasy-border')).toBe('border-026')
        } finally {
            view.unmount()
        }
    }
)

it('provides all 32 native 48px sources with bounded corner slices', () => {
    const entries = Object.entries(FANTASY_BORDER_VARIANTS)
    expect(entries).toHaveLength(32)
    expect(new Set(entries.map(([, value]) => value.src)).size).toBe(32)
    for (let index = 0; index < 32; index += 1) {
        const number = String(index).padStart(3, '0')
        const key = `border-${number}` as FantasyBorderVariant
        const variant = FANTASY_BORDER_VARIANTS[key]
        const source = readFileSync(
            join(
                dirname(fileURLToPath(import.meta.url)),
                '../assets/PNG/Default/Border',
                `panel-border-${number}.png`
            )
        )
        expect(source.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        expect(source.readUInt32BE(16)).toBe(48)
        expect(source.readUInt32BE(20)).toBe(48)
        expect(variant.slice).toBeGreaterThan(0)
        expect(variant.slice).toBeLessThanOrEqual(24)
        expect(resolveFantasyBorder(key)).toEqual({ key, ...variant })
    }
    expect(FANTASY_BORDER_VARIANTS['border-020'].slice).toBe(20)
    expect(FANTASY_BORDER_VARIANTS['border-025'].slice).toBe(20)
})
