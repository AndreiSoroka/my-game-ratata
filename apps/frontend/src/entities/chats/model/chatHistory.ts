import type {
    GameLocale,
    LocalizedMessage,
    SpeechTranslation,
    WorkerActivitySnapshot,
} from '@my-game-ratata/contracts'

import { tLocalized } from '@/shared/lib/i18n'

export interface ChatHistoryEntry {
    id: string
    channel: 'say' | 'whisper' | 'status'
    name: string
    actorId?: string
    text: string
    textMessage?: LocalizedMessage
    workerActivity?: Pick<WorkerActivitySnapshot, 'text' | 'textMessage'>
    language?: GameLocale
    translation?: SpeechTranslation
    self?: boolean
    at: number
    partnerId?: string
    partnerName?: string
    requestKey?: string
}

export function speechDisplayText(
    speech: Pick<ChatHistoryEntry, 'text' | 'textMessage' | 'translation' | 'workerActivity'>
): string {
    if (speech.translation) return speech.translation.text
    const text = tLocalized(speech.textMessage, speech.text)
    if (text === speech.text || !speech.workerActivity) return text
    const activity = tLocalized(speech.workerActivity.textMessage, speech.workerActivity.text)
    return `${text} ${activity}`
}

export type ChatHistoryFilter = 'all' | 'say' | 'whisper'

export function filterChatHistory(
    entries: readonly ChatHistoryEntry[],
    filter: ChatHistoryFilter
): readonly ChatHistoryEntry[] {
    if (filter === 'all') return entries
    return entries.filter(
        ({ channel }) => channel === filter || (filter === 'whisper' && channel === 'status')
    )
}
