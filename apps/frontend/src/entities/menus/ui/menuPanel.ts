import type { MenuItem, MenuNavigationCommand } from '../model/menu'

export interface MenuPanelProps {
    items: readonly MenuItem[]
    title?: string
    description?: string
}

/** Device adapters submit intentions. The menu owns item order and native focus. */
export interface MenuPanelHandle {
    navigate: (command: MenuNavigationCommand) => boolean
}
