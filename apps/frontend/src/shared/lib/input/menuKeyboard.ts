/** Device-independent intents understood by a vertical menu controller. */
export type MenuInputCommand = 'previous' | 'next' | 'first' | 'last' | 'activate'

const commands: Readonly<Record<string, MenuInputCommand>> = {
    KeyW: 'previous',
    ArrowUp: 'previous',
    KeyS: 'next',
    ArrowDown: 'next',
    Home: 'first',
    End: 'last',
    Enter: 'activate',
    NumpadEnter: 'activate',
    Space: 'activate',
    ' ': 'activate',
    KeyF: 'activate',
}

function commandFor(event: KeyboardEvent): MenuInputCommand | undefined {
    const code = event.code || event.key
    if (code === 'Tab') return event.shiftKey ? 'previous' : 'next'
    return Object.hasOwn(commands, code) ? commands[code] : undefined
}

/** Bind on the owning menu surface; this adapter never installs global shortcuts. */
export function menuKeyboardInput(
    event: KeyboardEvent,
    dispatch: (command: MenuInputCommand) => boolean
): boolean {
    if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof Element &&
            event.target.closest('input, textarea, select, [contenteditable="true"]'))
    )
        return false
    const command = commandFor(event)
    if (!command) return false
    event.preventDefault()
    event.stopPropagation()
    if (command !== 'activate' || !event.repeat) dispatch(command)
    return true
}
