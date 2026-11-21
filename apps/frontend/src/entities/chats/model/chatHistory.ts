export interface ChatHistoryEntry {
    id: string
    channel: 'say' | 'whisper' | 'status'
    name: string
    text: string
    at: number
    partnerId?: string
    partnerName?: string
    requestKey?: string
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
