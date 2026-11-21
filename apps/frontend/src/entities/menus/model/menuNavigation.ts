import type { MenuNavigationCommand } from './menu'

export function menuNavigationTargetIndex(
    command: MenuNavigationCommand,
    current: number,
    length: number
): number {
    if (command === 'first') return 0
    if (command === 'last') return length - 1
    if (command === 'next') return (current + 1) % length
    if (command === 'previous') return ((current < 0 ? 0 : current) - 1 + length) % length
    return -1
}
