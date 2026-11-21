import type { MenuInputCommand } from '@/shared/lib/input'
import type { UiButtonVariant } from '@/shared/ui/common'

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

export type MenuNavigationCommand = MenuInputCommand
