import type { FantasyBorderVariant } from './borderVariants'

export interface FantasyBorderProps {
    as?: 'div' | 'span'
    border?: FantasyBorderVariant
    color?: string
}
