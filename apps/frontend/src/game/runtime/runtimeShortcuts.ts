interface ShortcutActions {
    attack: () => void
    pickup: () => void
    inventory: () => void
    context: (() => void) | undefined
}
export function handleRuntimeShortcut(event: KeyboardEvent, actions: ShortcutActions): boolean {
    const action =
        event.code === 'KeyQ'
            ? actions.attack
            : event.code === 'KeyE'
              ? (actions.context ?? actions.pickup)
              : event.code === 'KeyI'
                ? actions.inventory
                : undefined
    if (!action) return false
    event.preventDefault()
    if (event.code === 'KeyQ' || !event.repeat) action()
    return true
}
