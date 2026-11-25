import { lightUiColors } from '@/shared/ui/theme'

import type {
    UiButtonAppearance,
    UiButtonColors,
    UiButtonProps,
    UiButtonStateColors,
    UiButtonVariant,
} from './uiButtonProps'

export const hudPanelButtonColors = {
    normal: {
        text: lightUiColors.button.panelShade,
        border: lightUiColors.border.wood,
        backgroundTop: lightUiColors.border.cream,
        backgroundBottom: lightUiColors.button.selectedEdge,
    },
    highlighted: {
        text: lightUiColors.button.panelShade,
        border: lightUiColors.button.selectedEdge,
        backgroundTop: lightUiColors.panel.parchment,
        backgroundBottom: lightUiColors.border.cream,
    },
    pressed: {
        text: lightUiColors.button.panelShade,
        border: lightUiColors.border.wood,
    },
    focus: lightUiColors.border.gold,
} satisfies UiButtonColors

const darkPanelSurface = 'var(--ui-themed-panel-surface, var(--ui-dark-panel-surface))'
const darkPanelAccent = 'var(--ui-themed-panel-accent, var(--ui-dark-panel-border))'

function darkPanelTint(accentPercent: number): string {
    return `color-mix(in srgb, ${darkPanelAccent} ${accentPercent}%, ${darkPanelSurface})`
}

export const darkPanelButtonColors = {
    normal: {
        text: 'var(--ui-dark-panel-text)',
        border: darkPanelTint(64),
        backgroundTop: darkPanelTint(18),
        backgroundBottom: darkPanelTint(8),
    },
    highlighted: {
        text: 'var(--ui-dark-panel-title)',
        border: darkPanelTint(84),
        backgroundTop: darkPanelTint(27),
        backgroundBottom: darkPanelTint(17),
    },
    focus: 'var(--ui-dark-panel-title)',
} satisfies UiButtonColors

export const selectedDarkPanelButtonColors = {
    ...darkPanelButtonColors,
    highlighted: {
        text: 'var(--ui-dark-panel-title)',
        border: darkPanelAccent,
        backgroundTop: darkPanelTint(38),
        backgroundBottom: darkPanelTint(25),
    },
} satisfies UiButtonColors

export const interactionButtonColors = {
    ...darkPanelButtonColors,
    highlighted: {
        ...darkPanelButtonColors.highlighted,
        border: 'var(--game-ui-focus)',
    },
    focus: 'var(--game-ui-focus)',
} satisfies UiButtonColors

export const dangerInteractionButtonColors = {
    normal: {
        text: 'var(--ui-dark-panel-warning)',
        border: 'var(--ui-dark-action-danger-border)',
        backgroundTop: 'var(--ui-dark-action-danger-top)',
        backgroundBottom: 'var(--ui-dark-action-danger-bottom)',
    },
    highlighted: {
        text: 'var(--ui-dark-panel-title)',
        border: 'var(--ui-dark-panel-warning)',
        backgroundTop: 'var(--ui-dark-action-danger-hover-top)',
        backgroundBottom: 'var(--ui-dark-action-danger-hover-bottom)',
    },
    focus: 'var(--game-ui-focus)',
} satisfies UiButtonColors

export const constellationButtonColors = {
    normal: {
        text: 'var(--ui-sky-starlight)',
        border: 'var(--ui-sky-border)',
        backgroundTop: 'var(--ui-sky-surface-raised)',
        backgroundBottom: 'var(--ui-sky-surface)',
    },
    highlighted: {
        text: 'var(--ui-sky-starlight)',
        border: 'var(--ui-sky-starlight)',
        backgroundTop: 'color-mix(in srgb, var(--ui-sky-surface-raised) 78%, var(--ui-sky-border))',
        backgroundBottom: 'var(--ui-sky-surface-raised)',
    },
    shadow: 'var(--ui-sky-surface)',
    focus: 'var(--ui-sky-starlight)',
} satisfies UiButtonColors

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

function defaultStates({ variant = 'secondary', appearance, panelAppearance }: UiButtonProps) {
    const ghost = appearance === 'ghost'
    const panel = appearance === 'panel'
    const translucent = panel && panelAppearance === 'transparent-center'
    const palette = palettes[variant]
    const border = panel ? 'var(--ui-button-panel-color)' : ornaments[variant]
    const panelText = translucent ? lightUiColors.button.panelShade : undefined
    const normalText = ghost ? lightUiColors.panel.title : lightUiColors.button.text
    const activeText = panelText ?? lightUiColors.button.textHover
    return {
        normal: {
            text: panelText ?? normalText,
            border: ghost ? lightUiColors.border.wood : border,
            backgroundTop: ghost ? 'transparent' : palette.top,
            backgroundBottom: ghost ? 'transparent' : palette.bottom,
        },
        highlighted: {
            text: activeText,
            border,
            backgroundTop: palette.hoverTop,
            backgroundBottom: palette.hoverBottom,
        },
        pressed: {
            text: activeText,
            border,
            backgroundTop: palette.bottom,
            backgroundBottom: palette.top,
        },
    }
}

function effectProperties(
    colors: UiButtonColors,
    appearance: UiButtonAppearance | undefined
): Record<string, string> {
    return {
        '--ui-button-edge':
            colors.edge ?? (appearance === 'ghost' ? lightUiColors.button.edge : 'transparent'),
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
    const defaults = defaultStates(props)
    return {
        ...stateProperties('normal', { ...defaults.normal, ...colors.normal }),
        ...stateProperties('highlighted', highlightedColors(defaults.highlighted, colors)),
        ...stateProperties('pressed', pressedColors(defaults.pressed, colors)),
        ...effectProperties(colors, props.appearance),
    }
}
