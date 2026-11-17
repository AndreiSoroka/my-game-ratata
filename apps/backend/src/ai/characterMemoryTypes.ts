export interface MemoryMessage {
    id: string
    senderId: string
    senderName: string
    recipientId?: string
    text: string
    channel: 'say' | 'whisper'
    source: 'heard' | 'seen' | 'authoritative'
    at: number
    locationId: string
}
export interface PersonMemoryUpdate {
    personId: string
    throughMessageId: string
    text: string
    sourceMessageIds: string[]
}
export interface PersonMemory {
    id: string
    name: string
    summary: string
    sourceMessageIds: string[]
    through: number
    lastAt: number
    compacted: boolean
    lastStatement?: { text: string; sourceId: string; at: number }
    lastSeen?: {
        at: number
        locationId: string
        position: { x: number; y: number }
    }
}
export interface DeepMemoryResult {
    personId: string
    status: 'found' | 'not_known'
    contracts?: import('./contractProjection').KnownContracts
    summary?: string
    messages?: MemoryMessage[]
    sourceMessageIds?: string[]
    compacted?: boolean
    hasMore?: boolean
}
