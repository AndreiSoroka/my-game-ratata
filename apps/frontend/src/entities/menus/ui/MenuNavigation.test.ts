import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { type MenuItem, type MenuNavigationCommand, MenuPanel } from '../index'

const items: readonly MenuItem[] = [
    { id: 'locked-first', label: 'Первый недоступен', disabled: true },
    { id: 'first', label: 'Первый' },
    { id: 'locked-middle', label: 'Средний недоступен', disabled: true },
    { id: 'last', label: 'Последний' },
    { id: 'locked-last', label: 'Последний недоступен', disabled: true },
]

it('navigates enabled items in entity order with wrapping, first and last commands', () => {
    const view = mount(MenuPanel, { props: { items }, attachTo: document.body })
    try {
        const first = view.get('[data-menu-item="first"]').element
        const last = view.get('[data-menu-item="last"]').element
        expect(view.vm.navigate('next')).toBe(true)
        expect(document.activeElement).toBe(first)
        expect(view.vm.navigate('next')).toBe(true)
        expect(document.activeElement).toBe(last)
        expect(view.vm.navigate('next')).toBe(true)
        expect(document.activeElement).toBe(first)
        expect(view.vm.navigate('previous')).toBe(true)
        expect(document.activeElement).toBe(last)
        expect(view.vm.navigate('previous')).toBe(true)
        expect(document.activeElement).toBe(first)
        expect(view.vm.navigate('last')).toBe(true)
        expect(document.activeElement).toBe(last)
        expect(view.vm.navigate('first')).toBe(true)
        expect(document.activeElement).toBe(first)
        expect(view.emitted('action')).toBeUndefined()
    } finally {
        view.unmount()
    }
})

it('starts previous navigation at the last enabled item when no menu item owns focus', () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    const view = mount(MenuPanel, { props: { items }, attachTo: document.body })
    try {
        expect(view.vm.navigate('previous')).toBe(true)
        expect(document.activeElement).toBe(view.get('[data-menu-item="last"]').element)
    } finally {
        view.unmount()
        outside.remove()
    }
})

it('lets device-neutral commands take highlight from the mouse and activate native focus once', async () => {
    const onAction = vi.fn<(id: string) => void>()
    const view = mount(MenuPanel, { props: { items, onAction }, attachTo: document.body })
    try {
        const first = view.get('[data-menu-item="first"]')
        const last = view.get('[data-menu-item="last"]')
        await last.trigger('pointerenter', { pointerType: 'mouse' })
        expect(last.attributes('data-menu-highlighted')).toBe('true')
        expect(view.vm.navigate('first')).toBe(true)
        await view.vm.$nextTick()
        expect(first.attributes('data-menu-highlighted')).toBe('true')
        expect(last.attributes('data-menu-highlighted')).toBe('false')
        expect(view.vm.navigate('activate')).toBe(true)
        expect(onAction).toHaveBeenCalledExactlyOnceWith('first')
        expect(view.emitted('action')).toEqual([['first']])
        expect(view.vm.navigate('next')).toBe(true)
        await view.vm.$nextTick()
        expect(last.attributes('data-menu-highlighted')).toBe('true')
        expect(document.activeElement).toBe(last.element)
    } finally {
        view.unmount()
    }
})

it('never substitutes hovered or externally focused buttons for menu activation', async () => {
    const outside = document.createElement('button')
    const outsideClick = vi.fn<() => void>()
    outside.addEventListener('click', outsideClick)
    document.body.append(outside)
    const view = mount(MenuPanel, { props: { items }, attachTo: document.body })
    try {
        await view.get('[data-menu-item="last"]').trigger('pointerenter', { pointerType: 'mouse' })
        outside.focus()
        expect(view.vm.navigate('activate')).toBe(false)
        await view.vm.$nextTick()
        expect(view.emitted('action')).toBeUndefined()
        expect(outsideClick).not.toHaveBeenCalled()
        expect(document.activeElement).toBe(outside)
        expect(view.findAll('[data-menu-highlighted="true"]')).toHaveLength(0)
    } finally {
        view.unmount()
        outside.remove()
    }
})

it.each([
    { name: 'empty', available: [] },
    {
        name: 'all disabled',
        available: [{ id: 'locked', label: 'Недоступно', disabled: true }],
    },
])('leaves focus untouched when no item is enabled: $name', ({ available }) => {
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    const view = mount(MenuPanel, {
        props: { items: available },
        attachTo: document.body,
    })
    try {
        const commands: MenuNavigationCommand[] = ['previous', 'next', 'first', 'last', 'activate']
        for (const command of commands) expect(view.vm.navigate(command)).toBe(false)
        expect(document.activeElement).toBe(outside)
        expect(view.emitted('action')).toBeUndefined()
    } finally {
        view.unmount()
        outside.remove()
    }
})

it('uses live item order and refuses activation after the focused item is disabled or removed', async () => {
    const view = mount(MenuPanel, { props: { items }, attachTo: document.body })
    try {
        view.vm.navigate('first')
        await view.setProps({
            items: [
                { id: 'last', label: 'Последний' },
                { id: 'first', label: 'Первый' },
                { id: 'new', label: 'Новый' },
            ],
        })
        expect(view.vm.navigate('next')).toBe(true)
        expect(document.activeElement).toBe(view.get('[data-menu-item="new"]').element)
        await view.setProps({
            items: [
                { id: 'last', label: 'Последний' },
                { id: 'new', label: 'Новый', disabled: true },
            ],
        })
        expect(view.vm.navigate('activate')).toBe(false)
        expect(view.emitted('action')).toBeUndefined()
        expect(view.vm.navigate('next')).toBe(true)
        expect(document.activeElement).toBe(view.get('[data-menu-item="last"]').element)
        await view.setProps({ items: [{ id: 'different', label: 'Другой' }] })
        expect(view.vm.navigate('activate')).toBe(false)
        expect(view.emitted('action')).toBeUndefined()
        expect(view.vm.navigate('last')).toBe(true)
        expect(document.activeElement).toBe(view.get('[data-menu-item="different"]').element)
    } finally {
        view.unmount()
    }
})
