import type { Vector2 } from '@my-game-ratata/contracts'

export const movementKeys = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight',
])

export function axisFromKeys(keys: Set<string>): Vector2 {
    return {
        x: keyAxis(keys, 'KeyD', 'ArrowRight') - keyAxis(keys, 'KeyA', 'ArrowLeft'),
        y: keyAxis(keys, 'KeyS', 'ArrowDown') - keyAxis(keys, 'KeyW', 'ArrowUp'),
    }
}

export function preventContextMenu(event: Event): void {
    event.preventDefault()
}

function keyAxis(keys: Set<string>, primary: string, secondary: string): number {
    return keys.has(primary) || keys.has(secondary) ? 1 : 0
}
