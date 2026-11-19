import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { FantasyPanel, type FantasyPanelAppearance, type FantasyPanelVariant } from './index'
import { FANTASY_PANEL_VARIANTS, resolveFantasyPanel } from './panelVariants'

it('preserves its native div, arbitrary slot content and native attributes/events', async () => {
    const onClick = vi.fn<(event: MouseEvent) => void>()
    const view = mount(FantasyPanel, {
        attrs: {
            id: 'offer-panel',
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
        expect(view.attributes('data-fantasy-panel')).toBe('panel-026')
        expect(view.attributes('data-fantasy-panel-appearance')).toBe('solid')
        expect(view.attributes('id')).toBe('offer-panel')
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

it('updates panel, appearance and color without replacing the slot or filtering its content', async () => {
    const view = mount(FantasyPanel, {
        props: { color: 'rgba(255, 0, 0, 0.5)' },
        attrs: { style: { color: 'rgb(0, 128, 0)' } },
        slots: { default: '<span style="color: rgb(0, 0, 255)">Синий текст</span>' },
    })
    try {
        const root = view.element
        const slot = view.get('span').element
        const slotHtml = view.get('span').html()
        expect(view.get('filter').attributes('color-interpolation-filters')).toBe('sRGB')
        expect(view.get('feComposite').attributes('operator')).toBe('in')
        expect(view.get('feComposite').attributes('in2')).toBe('SourceAlpha')
        expect(view.get('feFlood').attributes('style')).toContain('rgba(255, 0, 0, 0.5)')
        await view.setProps({
            panel: 'panel-025',
            appearance: 'transparent-center',
            color: 'var(--panel-accent)',
        })
        expect(view.element).toBe(root)
        expect(view.get('span').element).toBe(slot)
        expect(view.get('span').html()).toBe(slotHtml)
        expect(view.attributes('data-fantasy-panel')).toBe('panel-025')
        expect(view.attributes('data-fantasy-panel-appearance')).toBe('transparent-center')
        expect(view.attributes('style')).toContain('panel-transparent-center-025.png')
        expect(view.get('feFlood').attributes('style')).toContain('var(--panel-accent)')
        await view.setProps({ appearance: 'transparent-border' })
        expect(view.attributes('data-fantasy-panel-appearance')).toBe('transparent-border')
        expect(view.attributes('style')).toContain('panel-transparent-border-025.png')
        expect((view.element as HTMLElement).style.color).toBe('rgb(0, 128, 0)')
        expect((view.element as HTMLElement).style.filter).toBe('')
    } finally {
        view.unmount()
    }
})

it('uses independent color filter identities across separate Vue applications', () => {
    const first = mount(FantasyPanel, { props: { color: 'red' } })
    const second = mount(FantasyPanel, { props: { color: 'blue' } })
    try {
        const firstId = first.get('filter').attributes('id')
        const secondId = second.get('filter').attributes('id')
        expect(firstId).toBeTruthy()
        expect(secondId).toBeTruthy()
        expect(firstId).not.toBe(secondId)
        expect(first.attributes('style')).toContain(`#${firstId}`)
        expect(second.attributes('style')).toContain(`#${secondId}`)
    } finally {
        first.unmount()
        second.unmount()
    }
})

it.each(['missing', '__proto__', 'constructor', '', undefined])(
    'falls back for runtime panel %s while retaining a valid appearance',
    (panel) => {
        expect(resolveFantasyPanel(panel, 'transparent-center').key).toBe('panel-026')
        const view = mount(FantasyPanel, {
            props: {
                panel: panel as FantasyPanelVariant | undefined,
                appearance: 'transparent-center',
            },
        })
        try {
            expect(view.attributes('data-fantasy-panel')).toBe('panel-026')
            expect(view.attributes('data-fantasy-panel-appearance')).toBe('transparent-center')
        } finally {
            view.unmount()
        }
    }
)

it.each(['missing', '__proto__', 'constructor', '', undefined])(
    'falls back for runtime appearance %s while retaining a valid panel',
    (appearance) => {
        expect(resolveFantasyPanel('panel-020', appearance).appearance).toBe('solid')
        const view = mount(FantasyPanel, {
            props: {
                panel: 'panel-020',
                appearance: appearance as FantasyPanelAppearance | undefined,
            },
        })
        try {
            expect(view.attributes('data-fantasy-panel')).toBe('panel-020')
            expect(view.attributes('data-fantasy-panel-appearance')).toBe('solid')
        } finally {
            view.unmount()
        }
    }
)

it('registers all 96 independent native 48px images with their authored panel slices', () => {
    const entries = Object.entries(FANTASY_PANEL_VARIANTS)
    const slices = [
        12, 10, 14, 12, 8, 14, 14, 14, 16, 10, 12, 12, 12, 12, 12, 4, 18, 18, 16, 14, 22, 16, 14,
        14, 16, 22, 18, 16, 12, 16, 12, 14,
    ]
    expect(entries).toHaveLength(32)
    expect(
        new Set(
            entries.flatMap(([, value]) => [
                value.solidSrc,
                value.transparentBorderSrc,
                value.transparentCenterSrc,
            ])
        ).size
    ).toBe(96)
    for (let index = 0; index < 32; index += 1) {
        const number = String(index).padStart(3, '0')
        const key = `panel-${number}` as FantasyPanelVariant
        const metadata = FANTASY_PANEL_VARIANTS[key]
        expect(metadata.slice).toBe(slices[index])
        const files = [
            ['solid', 'Panel', `panel-${number}.png`, metadata.solidSrc],
            [
                'transparent-border',
                'Transparent border',
                `panel-transparent-border-${number}.png`,
                metadata.transparentBorderSrc,
            ],
            [
                'transparent-center',
                'Transparent center',
                `panel-transparent-center-${number}.png`,
                metadata.transparentCenterSrc,
            ],
        ] as const
        for (const [appearance, folder, filename, src] of files) {
            expect(src).toContain(filename)
            const source = readFileSync(
                join(
                    dirname(fileURLToPath(import.meta.url)),
                    '../assets/PNG/Default',
                    folder,
                    filename
                )
            )
            expect(source.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            expect(source.readUInt32BE(16)).toBe(48)
            expect(source.readUInt32BE(20)).toBe(48)
            expect(resolveFantasyPanel(key, appearance)).toEqual({
                key,
                appearance,
                src,
                slice: metadata.slice,
            })
        }
    }
})
