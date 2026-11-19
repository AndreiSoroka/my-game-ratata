import border000 from '../assets/PNG/Default/Border/panel-border-000.png'
import border001 from '../assets/PNG/Default/Border/panel-border-001.png'
import border002 from '../assets/PNG/Default/Border/panel-border-002.png'
import border003 from '../assets/PNG/Default/Border/panel-border-003.png'
import border004 from '../assets/PNG/Default/Border/panel-border-004.png'
import border005 from '../assets/PNG/Default/Border/panel-border-005.png'
import border006 from '../assets/PNG/Default/Border/panel-border-006.png'
import border007 from '../assets/PNG/Default/Border/panel-border-007.png'
import border008 from '../assets/PNG/Default/Border/panel-border-008.png'
import border009 from '../assets/PNG/Default/Border/panel-border-009.png'
import border010 from '../assets/PNG/Default/Border/panel-border-010.png'
import border011 from '../assets/PNG/Default/Border/panel-border-011.png'
import border012 from '../assets/PNG/Default/Border/panel-border-012.png'
import border013 from '../assets/PNG/Default/Border/panel-border-013.png'
import border014 from '../assets/PNG/Default/Border/panel-border-014.png'
import border015 from '../assets/PNG/Default/Border/panel-border-015.png'
import border016 from '../assets/PNG/Default/Border/panel-border-016.png'
import border017 from '../assets/PNG/Default/Border/panel-border-017.png'
import border018 from '../assets/PNG/Default/Border/panel-border-018.png'
import border019 from '../assets/PNG/Default/Border/panel-border-019.png'
import border020 from '../assets/PNG/Default/Border/panel-border-020.png'
import border021 from '../assets/PNG/Default/Border/panel-border-021.png'
import border022 from '../assets/PNG/Default/Border/panel-border-022.png'
import border023 from '../assets/PNG/Default/Border/panel-border-023.png'
import border024 from '../assets/PNG/Default/Border/panel-border-024.png'
import border025 from '../assets/PNG/Default/Border/panel-border-025.png'
import border026 from '../assets/PNG/Default/Border/panel-border-026.png'
import border027 from '../assets/PNG/Default/Border/panel-border-027.png'
import border028 from '../assets/PNG/Default/Border/panel-border-028.png'
import border029 from '../assets/PNG/Default/Border/panel-border-029.png'
import border030 from '../assets/PNG/Default/Border/panel-border-030.png'
import border031 from '../assets/PNG/Default/Border/panel-border-031.png'

/** Native 48px images; the slice keeps every corner ornament out of the stretched edges. */
export const FANTASY_BORDER_VARIANTS = {
    'border-000': { src: border000, slice: 10 },
    'border-001': { src: border001, slice: 8 },
    'border-002': { src: border002, slice: 12 },
    'border-003': { src: border003, slice: 10 },
    'border-004': { src: border004, slice: 8 },
    'border-005': { src: border005, slice: 12 },
    'border-006': { src: border006, slice: 12 },
    'border-007': { src: border007, slice: 12 },
    'border-008': { src: border008, slice: 8 },
    'border-009': { src: border009, slice: 8 },
    'border-010': { src: border010, slice: 10 },
    'border-011': { src: border011, slice: 10 },
    'border-012': { src: border012, slice: 10 },
    'border-013': { src: border013, slice: 10 },
    'border-014': { src: border014, slice: 10 },
    'border-015': { src: border015, slice: 2 },
    'border-016': { src: border016, slice: 16 },
    'border-017': { src: border017, slice: 16 },
    'border-018': { src: border018, slice: 14 },
    'border-019': { src: border019, slice: 12 },
    'border-020': { src: border020, slice: 20 },
    'border-021': { src: border021, slice: 14 },
    'border-022': { src: border022, slice: 12 },
    'border-023': { src: border023, slice: 12 },
    'border-024': { src: border024, slice: 14 },
    'border-025': { src: border025, slice: 20 },
    'border-026': { src: border026, slice: 16 },
    'border-027': { src: border027, slice: 14 },
    'border-028': { src: border028, slice: 10 },
    'border-029': { src: border029, slice: 14 },
    'border-030': { src: border030, slice: 10 },
    'border-031': { src: border031, slice: 12 },
} as const

export type FantasyBorderVariant = keyof typeof FANTASY_BORDER_VARIANTS

export function resolveFantasyBorder(border: string | undefined): {
    key: FantasyBorderVariant
    src: string
    slice: number
} {
    const key = (
        typeof border === 'string' && Object.hasOwn(FANTASY_BORDER_VARIANTS, border)
            ? border
            : 'border-026'
    ) as FantasyBorderVariant
    return { key, ...FANTASY_BORDER_VARIANTS[key] }
}
