import type { UiButtonColors } from '@/shared/ui/common'
import { lightUiColors } from '@/shared/ui/theme'

export const chatButtonColors = {
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
