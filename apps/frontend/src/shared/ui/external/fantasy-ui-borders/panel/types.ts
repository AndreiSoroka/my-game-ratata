import type { FantasyPanelAppearance, FantasyPanelVariant } from './panelVariants'

export interface FantasyPanelProps {
    as?: 'div' | 'span'
    panel?: FantasyPanelVariant
    appearance?: FantasyPanelAppearance
    color?: string
    borderColor?: string
    backgroundColor?: string
    backgroundGradient?: readonly [top: string, bottom: string]
}
