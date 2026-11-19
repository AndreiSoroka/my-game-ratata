import type { FantasyBorderVariant } from '@/shared/ui/external/fantasy-ui-borders/border'

export type UiButtonVariant = 'secondary' | 'primary' | 'success' | 'danger'
export type UiButtonAppearance = 'filled' | 'ghost'

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
    variant?: UiButtonVariant
    colors?: UiButtonColors
    highlighted?: boolean
    focusRing?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
}
