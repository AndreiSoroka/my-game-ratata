import { expect, it, vi } from 'vitest'

import { type MenuInputCommand, menuKeyboardInput } from './index'

it.each<[string, MenuInputCommand]>([
    ['KeyW', 'previous'],
    ['ArrowUp', 'previous'],
    ['KeyS', 'next'],
    ['ArrowDown', 'next'],
    ['Home', 'first'],
    ['End', 'last'],
    ['Tab', 'next'],
    ['Enter', 'activate'],
    ['NumpadEnter', 'activate'],
    ['Space', 'activate'],
    ['KeyF', 'activate'],
])('translates %s without owning the menu navigation', (code, command) => {
    const dispatch = vi.fn<(command: MenuInputCommand) => boolean>(() => true)
    const event = new KeyboardEvent('keydown', { code, cancelable: true })
    expect(menuKeyboardInput(event, dispatch)).toBe(true)
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(command)
    expect(event.defaultPrevented).toBe(true)
})

it('uses physical W/S independently of keyboard layout and reverses Shift+Tab', () => {
    const dispatch = vi.fn<(command: MenuInputCommand) => boolean>(() => true)
    menuKeyboardInput(new KeyboardEvent('keydown', { code: 'KeyW', key: 'ц' }), dispatch)
    menuKeyboardInput(new KeyboardEvent('keydown', { code: 'KeyS', key: 'ы' }), dispatch)
    menuKeyboardInput(new KeyboardEvent('keydown', { code: 'Tab', shiftKey: true }), dispatch)
    expect(dispatch.mock.calls.map(([command]) => command)).toEqual([
        'previous',
        'next',
        'previous',
    ])
})

it('consumes held confirmation once while allowing held navigation and empty-menu ownership', () => {
    const dispatch = vi.fn<(command: MenuInputCommand) => boolean>(() => false)
    const held = new KeyboardEvent('keydown', {
        code: 'Enter',
        repeat: true,
        cancelable: true,
    })
    expect(menuKeyboardInput(held, dispatch)).toBe(true)
    expect(held.defaultPrevented).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
    const next = new KeyboardEvent('keydown', { code: 'KeyS', repeat: true, cancelable: true })
    expect(menuKeyboardInput(next, dispatch)).toBe(true)
    expect(next.defaultPrevented).toBe(true)
    expect(dispatch).toHaveBeenCalledExactlyOnceWith('next')
})

it('leaves editing, composition, modified shortcuts, Escape and handled events to their owners', () => {
    const dispatch = vi.fn<(command: MenuInputCommand) => boolean>(() => true)
    for (const options of [
        { code: 'Escape' },
        { code: 'KeyD' },
        { code: 'KeyS', ctrlKey: true },
        { code: 'KeyW', metaKey: true },
        { code: 'ArrowDown', altKey: true },
        { code: 'KeyS', isComposing: true },
    ]) {
        const event = new KeyboardEvent('keydown', { ...options, cancelable: true })
        expect(menuKeyboardInput(event, dispatch)).toBe(false)
        expect(event.defaultPrevented).toBe(false)
    }
    const handled = new KeyboardEvent('keydown', { code: 'KeyS', cancelable: true })
    handled.preventDefault()
    expect(menuKeyboardInput(handled, dispatch)).toBe(false)
    const input = document.createElement('input')
    input.addEventListener('keydown', (event) => menuKeyboardInput(event, dispatch))
    const editing = new KeyboardEvent('keydown', { code: 'KeyS', cancelable: true })
    input.dispatchEvent(editing)
    expect(editing.defaultPrevented).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
})
