import type { FantasyDividerVariant } from './dividerVariants'

export type FantasyDividerEnds = 'left' | 'right' | 'both'

export interface FantasyDividerProps {
    divider?: FantasyDividerVariant
    fade?: boolean
    ends?: FantasyDividerEnds
    color?: string
}
