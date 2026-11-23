export type GameLocale = 'ru' | 'en'

export interface LocalizedMessage {
    key: string
    params?: Record<string, string | number>
}

/** The server can supply authored English only after a disclosure rule grants the original. */
export const DISCLOSED_AUTHORED_TEXT_KEY = 'authored.disclosedText'

export function isGameLocale(value: unknown): value is GameLocale {
    return value === 'ru' || value === 'en'
}

/** Let names and game terms appear inside an otherwise unambiguous question. */
export function detectSpeechLanguage(text: string): GameLocale | undefined {
    const words = text.replace(/\b(?:https?:\/\/|www\.)\S+/giu, '')
    const cyrillic = words.match(/\p{Script=Cyrillic}+/gu)?.length ?? 0
    const latin = words.match(/\p{Script=Latin}+/gu)?.length ?? 0
    if (cyrillic > latin && cyrillic >= latin * 2) {
        return 'ru'
    }
    if (latin > cyrillic && latin >= cyrillic * 2) {
        return 'en'
    }
    return undefined
}
