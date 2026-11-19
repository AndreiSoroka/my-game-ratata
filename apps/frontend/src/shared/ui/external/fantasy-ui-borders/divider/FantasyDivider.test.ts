import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { FANTASY_DIVIDER_VARIANTS, resolveFantasyDivider } from './dividerVariants'
import { FantasyDivider, type FantasyDividerEnds, type FantasyDividerVariant } from './index'

it('renders one native horizontal separator with normal attributes and no content slot', async () => {
    const onClick = vi.fn<(event: MouseEvent) => void>()
    const view = mount(FantasyDivider, {
        attrs: {
            id: 'offer-divider',
            class: 'offer-layout',
            'aria-label': 'Граница предложений',
            title: 'Разделитель',
            onClick,
        },
        slots: { default: '<span>Не содержимое разделителя</span>' },
    })
    try {
        expect(view.element.tagName).toBe('DIV')
        expect(view.attributes('role')).toBe('separator')
        expect(view.attributes('aria-orientation')).toBe('horizontal')
        expect(view.attributes('data-fantasy-divider')).toBe('divider-000')
        expect(view.attributes('data-fantasy-divider-fade')).toBe('false')
        expect(view.attributes('data-fantasy-divider-ends')).toBe('right')
        expect(view.classes()).not.toContain('fantasy-divider--left')
        expect(view.classes()).not.toContain('fantasy-divider--both')
        expect(view.attributes('id')).toBe('offer-divider')
        expect(view.classes()).toContain('offer-layout')
        expect(view.attributes('aria-label')).toBe('Граница предложений')
        expect(view.attributes('title')).toBe('Разделитель')
        expect(view.find('span').exists()).toBe(false)
        expect(view.get('svg').attributes('aria-hidden')).toBe('true')
        expect(view.get('svg').attributes('width')).toBe('0')
        expect(view.get('svg').attributes('height')).toBe('0')
        expect(view.get('svg').attributes('style') ?? '').not.toContain('display: none')
        expect(view.get('feFlood').attributes('style')?.toLowerCase()).toContain('currentcolor')
        await view.trigger('click')
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(onClick.mock.calls[0]![0].target).toBe(view.element)
    } finally {
        view.unmount()
    }
})

it('reacts to divider, fade, direction and arbitrary CSS color changes', async () => {
    const view = mount(FantasyDivider, { props: { color: 'rgba(255, 0, 0, 0.5)' } })
    try {
        const root = view.element
        const filterId = view.get('filter').attributes('id')
        expect(view.get('feFlood').attributes('style')).toContain('rgba(255, 0, 0, 0.5)')
        expect(view.get('filter').attributes('color-interpolation-filters')).toBe('sRGB')
        expect(view.get('feComposite').attributes('in2')).toBe('SourceAlpha')
        expect(view.get('feComposite').attributes('operator')).toBe('in')
        await view.setProps({
            divider: 'divider-004',
            fade: true,
            ends: 'left',
            color: 'var(--divider-accent)',
        })
        expect(view.element).toBe(root)
        expect(view.attributes('data-fantasy-divider')).toBe('divider-004')
        expect(view.attributes('data-fantasy-divider-fade')).toBe('true')
        expect(view.attributes('data-fantasy-divider-ends')).toBe('left')
        expect(view.classes()).toContain('fantasy-divider--left')
        expect(view.get('feFlood').attributes('style')).toContain('var(--divider-accent)')
        expect(view.get('filter').attributes('id')).toBe(filterId)
        expect(view.attributes('style')).toContain('divider-fade-004.png')
        expect((view.element as HTMLElement).style.filter).toBe('')
        expect((view.element as HTMLElement).style.transform).toBe('')
        await view.setProps({ fade: false, ends: 'both' })
        expect(view.attributes('style')).toContain('divider-004.png')
        expect(view.attributes('data-fantasy-divider-ends')).toBe('both')
        expect(view.classes()).toContain('fantasy-divider--both')
        expect(view.classes()).not.toContain('fantasy-divider--left')
        await view.setProps({ ends: 'right' })
        expect(view.attributes('data-fantasy-divider-ends')).toBe('right')
        expect(view.classes()).not.toContain('fantasy-divider--left')
        expect(view.classes()).not.toContain('fantasy-divider--both')
    } finally {
        view.unmount()
    }
})

it('keeps local color filter identities unique across separate Vue applications', () => {
    const first = mount(FantasyDivider, { props: { color: 'red' } })
    const second = mount(FantasyDivider, { props: { color: 'blue' } })
    try {
        const firstId = first.get('filter').attributes('id')
        const secondId = second.get('filter').attributes('id')
        expect(firstId).toMatch(/^fantasy-divider-filter-/)
        expect(secondId).toMatch(/^fantasy-divider-filter-/)
        expect(firstId).not.toBe(secondId)
        expect(first.attributes('style')).toContain(`#${firstId}`)
        expect(second.attributes('style')).toContain(`#${secondId}`)
    } finally {
        first.unmount()
        second.unmount()
    }
})

it.each(['missing', '__proto__', 'constructor', 'toString', '', undefined])(
    'falls back for the untyped runtime variant %s',
    (divider) => {
        expect(resolveFantasyDivider(divider).key).toBe('divider-000')
        const view = mount(FantasyDivider, {
            props: { divider: divider as FantasyDividerVariant | undefined },
        })
        try {
            expect(view.attributes('data-fantasy-divider')).toBe('divider-000')
        } finally {
            view.unmount()
        }
    }
)

it.each(['missing', '__proto__', undefined])(
    'uses the right end for an unknown runtime ends value %s',
    (ends) => {
        const view = mount(FantasyDivider, {
            props: { ends: ends as FantasyDividerEnds | undefined },
        })
        try {
            expect(view.attributes('data-fantasy-divider-ends')).toBe('right')
            expect(view.classes()).not.toContain('fantasy-divider--left')
            expect(view.classes()).not.toContain('fantasy-divider--both')
        } finally {
            view.unmount()
        }
    }
)

it('keeps all six independent solid/fade pairs at their authored native dimensions', () => {
    const entries = Object.entries(FANTASY_DIVIDER_VARIANTS)
    const heights = [22, 22, 10, 18, 14, 18]
    expect(entries).toHaveLength(6)
    expect(new Set(entries.flatMap(([, { src, fadeSrc }]) => [src, fadeSrc])).size).toBe(12)
    for (let index = 0; index < 6; index += 1) {
        const number = String(index).padStart(3, '0')
        const key = `divider-${number}` as FantasyDividerVariant
        const metadata = FANTASY_DIVIDER_VARIANTS[key]
        expect(metadata.src).not.toBe(metadata.fadeSrc)
        expect(metadata.height).toBe(heights[index])
        expect(metadata.capWidth).toBeGreaterThan(0)
        expect(metadata.capWidth).toBeLessThan(96)
        for (const [folder, filename] of [
            ['Divider', `divider-${number}.png`],
            ['Divider Fade', `divider-fade-${number}.png`],
        ]) {
            const source = readFileSync(
                join(
                    dirname(fileURLToPath(import.meta.url)),
                    '../assets/PNG/Default',
                    folder!,
                    filename!
                )
            )
            expect(source.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            expect(source.readUInt32BE(16)).toBe(96)
            expect(source.readUInt32BE(20)).toBe(heights[index])
        }
        expect(resolveFantasyDivider(key)).toEqual({ key, ...metadata })
    }
})
