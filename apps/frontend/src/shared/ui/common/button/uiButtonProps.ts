import type { FantasyBorderVariant } from '@/shared/ui/external/fantasy-ui-borders/border'
import type { FantasyPanelVariant } from '@/shared/ui/external/fantasy-ui-borders/panel'

export type UiButtonVariant = 'secondary' | 'primary' | 'success' | 'danger'
export type UiButtonAppearance = 'filled' | 'ghost' | 'panel'
export type UiButtonPanelAppearance = 'solid' | 'transparent-center'
export type UiButtonSize = 'default' | 'small' | 'compact'

export interface UiButtonStateColors {
    text?: string
    border?: string
    backgroundTop?: string
    backgroundBottom?: string
}

export interface UiButtonColors {
    normal?: UiButtonStateColors
    highlighted?: UiButtonStateColors
    pressed?: UiButtonStateColors
    edge?: string
    shadow?: string
    pressedShadow?: string
    focus?: string
}

export interface UiButtonProps {
    border?: FantasyBorderVariant
    appearance?: UiButtonAppearance
    panel?: FantasyPanelVariant
    panelAppearance?: UiButtonPanelAppearance
    variant?: UiButtonVariant
    size?: UiButtonSize
    icon?: boolean
    colors?: UiButtonColors
    highlighted?: boolean
    selected?: boolean
    focusRing?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
}
