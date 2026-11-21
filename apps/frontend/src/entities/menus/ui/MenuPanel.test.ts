import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { type MenuItem, MenuPanel } from '../index'

const items: readonly MenuItem[] = [
    { id: 'resume', label: 'Вернуться в игру', variant: 'primary' },
    { id: 'character', label: 'Персонаж', key: 'P' },
    { id: 'sound', label: 'Звук: выключен', ariaLabel: 'Без звука', pressed: true },
    { id: 'leave', label: 'Выйти из игры', variant: 'danger' },
]

it('renders data-driven actions with key text, accessibility and exactly one emitted id', async () => {
    const onAction = vi.fn<(id: string) => void>()
    const view = mount(MenuPanel, { props: { items, onAction } })
    try {
        expect(view.element.tagName).toBe('DIV')
        expect(view.get('h2').text()).toBe('Игровое меню')
        expect(view.findAll('button')).toHaveLength(4)
        expect(view.get('[data-dialog-action="character"]').text()).toBe('Персонаж · P')
        const sound = view.get('[data-dialog-action="sound"]')
        expect(sound.attributes('aria-label')).toBe('Без звука')
        expect(sound.attributes('aria-pressed')).toBe('true')
        expect(view.get('[data-dialog-action="resume"]').attributes('aria-pressed')).toBeUndefined()
        await sound.trigger('click')
        expect(onAction).toHaveBeenCalledExactlyOnceWith('sound')
        expect(view.emitted('action')).toEqual([['sound']])
        expect(view.get('[data-fantasy-border="border-015"]').classes()).toContain(
            'menu-panel__outer'
        )
        expect(view.get('[data-fantasy-border="border-014"]').classes()).toContain(
            'menu-panel__inner'
        )
    } finally {
        view.unmount()
    }
})

it('reacts to replacement items and exposes disabled explanations without emitting disabled actions', async () => {
    const view = mount(MenuPanel, { props: { items } })
    try {
        await view.setProps({
            title: 'Другое меню',
            description: '',
            items: [
                {
                    id: 'locked',
                    label: 'Недоступно',
                    disabled: true,
                    hint: 'Сначала войдите в игру.',
                },
            ],
        })
        expect(view.get('h2').text()).toBe('Другое меню')
        expect(view.find('.menu-panel__header p').exists()).toBe(false)
        expect(view.findAll('button')).toHaveLength(1)
        const button = view.get('[data-dialog-action="locked"]')
        expect(button.attributes('disabled')).toBeDefined()
        expect(view.get(`#${button.attributes('aria-describedby')}`).text()).toBe(
            'Сначала войдите в игру.'
        )
        await button.trigger('click')
        expect(view.emitted('action')).toBeUndefined()
    } finally {
        view.unmount()
    }
})

it('renders a two-ended divider before any requested item without adding an action or focus target', async () => {
    const view = mount(MenuPanel, { props: { items } })
    try {
        expect(view.findAll('[role="separator"]')).toHaveLength(0)
        await view.setProps({
            items: [{ id: 'custom-section', label: 'Другой раздел', dividerBefore: true }],
        })
        const divider = view.get('[role="separator"]')
        expect(divider.attributes('data-fantasy-divider')).toBe('divider-000')
        expect(divider.attributes('data-fantasy-divider-ends')).toBe('both')
        expect(divider.attributes('data-fantasy-divider-fade')).toBe('false')
        expect(divider.attributes('tabindex')).toBeUndefined()
        const button = view.get('[data-dialog-action="custom-section"]')
        expect(button.element.previousElementSibling).toBe(divider.element)
        expect(view.findAll('button')).toHaveLength(1)
        await button.trigger('click')
        expect(view.emitted('action')).toEqual([['custom-section']])
    } finally {
        view.unmount()
    }
})

it('keeps pointer highlight through gaps, clears on exit and never restores a clicked item', async () => {
    const view = mount(MenuPanel, { props: { items }, attachTo: document.body })
    try {
        const nav = view.get('.menu-panel__actions')
        const character = view.get('[data-dialog-action="character"]')
        const sound = view.get('[data-dialog-action="sound"]')
        await nav.trigger('pointerenter', { pointerType: 'mouse' })
        await character.trigger('pointerenter', { pointerType: 'mouse' })
        await character.trigger('pointerleave', { pointerType: 'mouse' })
        expect(character.attributes('data-menu-highlighted')).toBe('true')
        await character.trigger('pointerdown', { pointerType: 'mouse' })
        ;(character.element as HTMLButtonElement).focus()
        await character.trigger('click')
        await sound.trigger('pointerenter', { pointerType: 'mouse' })
        expect(sound.attributes('data-menu-highlighted')).toBe('true')
        expect(character.attributes('data-menu-highlighted')).toBe('false')
        await nav.trigger('pointerleave', { pointerType: 'mouse' })
        expect(view.findAll('[data-menu-highlighted="true"]')).toHaveLength(0)
    } finally {
        view.unmount()
    }
})

it('hands highlight to keyboard focus and ignores touch hover or cancelled pointer input', async () => {
    const view = mount(MenuPanel, { props: { items }, attachTo: document.body })
    try {
        const resume = view.get('[data-dialog-action="resume"]')
        const character = view.get('[data-dialog-action="character"]')
        await character.trigger('pointerenter', { pointerType: 'mouse' })
        ;(resume.element as HTMLButtonElement).focus()
        await resume.trigger('keydown', { code: 'ArrowDown', key: 'ArrowDown' })
        expect(resume.attributes('data-menu-highlighted')).toBe('true')
        expect(character.attributes('data-menu-highlighted')).toBe('false')
        await character.trigger('pointerenter', { pointerType: 'touch' })
        expect(resume.attributes('data-menu-highlighted')).toBe('true')
        await view.get('.menu-panel__actions').trigger('pointercancel')
        expect(view.findAll('[data-menu-highlighted="true"]')).toHaveLength(0)
        await character.trigger('pointerenter', { pointerType: 'mouse' })
        window.dispatchEvent(new Event('blur'))
        await view.vm.$nextTick()
        expect(view.findAll('[data-menu-highlighted="true"]')).toHaveLength(0)
    } finally {
        view.unmount()
    }
})
