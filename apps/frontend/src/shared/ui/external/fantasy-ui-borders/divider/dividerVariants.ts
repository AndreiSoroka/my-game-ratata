import fade000 from '../assets/PNG/Default/Divider Fade/divider-fade-000.png'
import fade001 from '../assets/PNG/Default/Divider Fade/divider-fade-001.png'
import fade002 from '../assets/PNG/Default/Divider Fade/divider-fade-002.png'
import fade003 from '../assets/PNG/Default/Divider Fade/divider-fade-003.png'
import fade004 from '../assets/PNG/Default/Divider Fade/divider-fade-004.png'
import fade005 from '../assets/PNG/Default/Divider Fade/divider-fade-005.png'
import divider000 from '../assets/PNG/Default/Divider/divider-000.png'
import divider001 from '../assets/PNG/Default/Divider/divider-001.png'
import divider002 from '../assets/PNG/Default/Divider/divider-002.png'
import divider003 from '../assets/PNG/Default/Divider/divider-003.png'
import divider004 from '../assets/PNG/Default/Divider/divider-004.png'
import divider005 from '../assets/PNG/Default/Divider/divider-005.png'

/** The right slice includes the complete ornament; only the remaining line is stretched. */
export const FANTASY_DIVIDER_VARIANTS = {
    'divider-000': { src: divider000, fadeSrc: fade000, height: 22, capWidth: 16 },
    'divider-001': { src: divider001, fadeSrc: fade001, height: 22, capWidth: 2 },
    'divider-002': { src: divider002, fadeSrc: fade002, height: 10, capWidth: 2 },
    'divider-003': { src: divider003, fadeSrc: fade003, height: 18, capWidth: 20 },
    'divider-004': { src: divider004, fadeSrc: fade004, height: 14, capWidth: 24 },
    'divider-005': { src: divider005, fadeSrc: fade005, height: 18, capWidth: 24 },
} as const

export type FantasyDividerVariant = keyof typeof FANTASY_DIVIDER_VARIANTS

export function resolveFantasyDivider(divider: string | undefined): {
    key: FantasyDividerVariant
    src: string
    fadeSrc: string
    height: number
    capWidth: number
} {
    const key = (
        typeof divider === 'string' && Object.hasOwn(FANTASY_DIVIDER_VARIANTS, divider)
            ? divider
            : 'divider-000'
    ) as FantasyDividerVariant
    return { key, ...FANTASY_DIVIDER_VARIANTS[key] }
}
