import type { Ref } from 'vue'

import type { MenuItem, MenuNavigationCommand, MenuPanelHandle } from './types'

/** Navigation depends on menu data and focus, never on a particular input device. */
export function useMenuNavigation(
    root: Ref<HTMLElement | undefined>,
    items: () => readonly MenuItem[],
    takeControl: () => void
): MenuPanelHandle {
    function enabledButtons(): HTMLButtonElement[] {
        const enabledIds = new Set(
            items()
                .filter((item) => !item.disabled)
                .map((item) => item.id)
        )
        return Array.from(
            root.value?.querySelectorAll<HTMLButtonElement>('button[data-menu-item]') ?? []
        ).filter((button) => !button.disabled && enabledIds.has(button.dataset.menuItem ?? ''))
    }
    function navigate(command: MenuNavigationCommand): boolean {
        takeControl()
        const buttons = enabledButtons()
        if (buttons.length === 0) return false
        const current = buttons.findIndex((button) => button === document.activeElement)
        if (command === 'activate') {
            const button = buttons[current]
            if (!button) return false
            button.click()
            return true
        }
        const index = targetIndex(command, current, buttons.length)
        const button = buttons[index]
        if (!button) return false
        button.focus()
        return document.activeElement === button
    }
    return { navigate }
}

function targetIndex(command: MenuNavigationCommand, current: number, length: number): number {
    if (command === 'first') return 0
    if (command === 'last') return length - 1
    if (command === 'next') return (current + 1) % length
    if (command === 'previous') return ((current < 0 ? 0 : current) - 1 + length) % length
    return -1
}
