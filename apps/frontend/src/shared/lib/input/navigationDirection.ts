export type NavigationDirection = 'up' | 'down' | 'left' | 'right'

const directions: Readonly<Partial<Record<string, NavigationDirection>>> = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
}

/** Read physical movement keys and arrow keys as local UI navigation. */
export function navigationDirection(event: KeyboardEvent): NavigationDirection | undefined {
    if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
    )
        return undefined
    const code = event.code || event.key
    return Object.hasOwn(directions, code) ? directions[code] : undefined
}
