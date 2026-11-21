import type { Ref } from 'vue'

import type { MenuItem, MenuNavigationCommand, MenuPanelHandle } from '../model/menu'
import { menuNavigationTargetIndex } from '../model/menuNavigation'

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
        const index = menuNavigationTargetIndex(command, current, buttons.length)
        const button = buttons[index]
        if (!button) return false
        button.focus()
        return document.activeElement === button
    }
    return { navigate }
}
