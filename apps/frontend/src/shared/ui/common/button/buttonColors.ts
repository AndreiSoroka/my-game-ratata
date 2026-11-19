import { lightUiColors } from '@/shared/ui/theme'

import type { UiButtonColors, UiButtonProps, UiButtonStateColors, UiButtonVariant } from './types'

const palettes = {
    secondary: lightUiColors.button.wood,
    primary: lightUiColors.button.primary,
    success: lightUiColors.button.success,
    danger: lightUiColors.button.danger,
}
const ornaments: Record<UiButtonVariant, string> = {
    secondary: lightUiColors.border.cream,
    primary: lightUiColors.border.gold,
    success: lightUiColors.border.cream,
    danger: lightUiColors.border.copper,
}

function stateProperties(name: string, colors: Required<UiButtonStateColors>) {
    return {
        [`--ui-button-${name}-text`]: colors.text,
        [`--ui-button-${name}-border`]: colors.border,
        [`--ui-button-${name}-top`]: colors.backgroundTop,
        [`--ui-button-${name}-bottom`]: colors.backgroundBottom,
    }
}

function defaultStates(variant: UiButtonVariant, ghost: boolean) {
    const palette = palettes[variant]
    return {
        normal: {
            text: ghost ? lightUiColors.panel.title : lightUiColors.button.text,
            border: ghost ? lightUiColors.border.wood : ornaments[variant],
            backgroundTop: ghost ? 'transparent' : palette.top,
            backgroundBottom: ghost ? 'transparent' : palette.bottom,
        },
        highlighted: {
            text: lightUiColors.button.textHover,
            border: ornaments[variant],
            backgroundTop: palette.hoverTop,
            backgroundBottom: palette.hoverBottom,
        },
        pressed: {
            text: lightUiColors.button.textHover,
            border: ornaments[variant],
            backgroundTop: palette.bottom,
            backgroundBottom: palette.top,
        },
    }
}

function effectProperties(colors: UiButtonColors): Record<string, string> {
    return {
        '--ui-button-edge': colors.edge ?? lightUiColors.button.edge,
        '--ui-button-shadow': colors.shadow ?? lightUiColors.button.shadow,
        '--ui-button-pressed-shadow': colors.pressedShadow ?? lightUiColors.button.pressedShadow,
        '--ui-button-focus': colors.focus ?? lightUiColors.button.focus,
    }
}

function highlightedColors(
    defaults: Required<UiButtonStateColors>,
    colors: UiButtonColors
): Required<UiButtonStateColors> {
    return {
        ...defaults,
        backgroundTop: colors.normal?.backgroundTop ?? defaults.backgroundTop,
        backgroundBottom: colors.normal?.backgroundBottom ?? defaults.backgroundBottom,
        ...colors.highlighted,
    }
}

function pressedColors(
    defaults: Required<UiButtonStateColors>,
    colors: UiButtonColors
): Required<UiButtonStateColors> {
    const pressed = colors.pressed ?? {}
    const highlighted = colors.highlighted ?? {}
    return {
        text: pressed.text ?? highlighted.text ?? defaults.text,
        border: pressed.border ?? highlighted.border ?? defaults.border,
        backgroundTop:
            pressed.backgroundTop ?? customFill(colors, 'backgroundBottom', defaults.backgroundTop),
        backgroundBottom:
            pressed.backgroundBottom ??
            customFill(colors, 'backgroundTop', defaults.backgroundBottom),
    }
}

function customFill(
    colors: UiButtonColors,
    key: 'backgroundTop' | 'backgroundBottom',
    fallback: string
): string {
    return colors.highlighted?.[key] ?? colors.normal?.[key] ?? fallback
}

export function uiButtonColors(props: UiButtonProps): Record<string, string> {
    const colors = props.colors ?? {}
    const defaults = defaultStates(props.variant ?? 'secondary', props.appearance === 'ghost')
    return {
        ...stateProperties('normal', { ...defaults.normal, ...colors.normal }),
        ...stateProperties('highlighted', highlightedColors(defaults.highlighted, colors)),
        ...stateProperties('pressed', pressedColors(defaults.pressed, colors)),
        ...effectProperties(colors),
    }
}
