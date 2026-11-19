import type { MenuInputCommand } from '@/shared/lib/input'
import type { UiButtonVariant } from '@/shared/ui/common/button'

export interface MenuItem {
    id: string
    label: string
    key?: string
    variant?: UiButtonVariant
    disabled?: boolean
    ariaLabel?: string
    pressed?: boolean
    hint?: string
    dividerBefore?: boolean
}

export interface MenuPanelProps {
    items: readonly MenuItem[]
    title?: string
    description?: string
}

export type MenuNavigationCommand = MenuInputCommand

/** Device adapters submit intentions; the menu owns item order and native focus. */
export interface MenuPanelHandle {
    navigate: (command: MenuNavigationCommand) => boolean
}
