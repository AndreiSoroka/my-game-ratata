import type { GameEventPayload, NpcRequestStatus, WorldSnapshot } from '@my-game-ratata/contracts'
import { ref } from 'vue'

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

const requestLabels: Record<NpcRequestStatus['state'], string> = {
    heard: 'Услышал',
    queued: 'Ответ в очереди',
    thinking: 'Обдумывает ответ',
    accepted: 'Поручение принято',
    declined: 'Поручение отклонено',
    started: 'Выполняет поручение',
    completed: 'Запрос завершён',
    failed: 'Не удалось выполнить',
    undelivered: 'Ответ готов, но собеседник вне слышимости',
    cancelled: 'Поручение отменено',
}

function requestText(value: NpcRequestStatus): string {
    const label = requestLabels[value.state]
    const named = ['thinking', 'accepted', 'declined', 'started', 'failed', 'cancelled'].includes(
        value.state
    )
    const request = named && value.request ? `: «${value.request}»` : ''
    const reason = value.reason ? `${request ? '. ' : ': '}${value.reason}` : ''
    return `${label}${request}${reason}`
}

/** Only delivered observer projections enter this buffer; history never replays world effects. */
class ChatHistory {
    public readonly entries = ref<ChatHistoryEntry[]>([])
    private sessionKey = ''
    private playerId: string | undefined
    private snapshot: WorldSnapshot | undefined
    private fallback = 0
    private readonly seen = new Set<string>()
    private add(entry: ChatHistoryEntry): void {
        if (this.seen.has(entry.id)) {
            this.seen.delete(entry.id)
            this.seen.add(entry.id)
            return
        }
        this.seen.add(entry.id)
        const previous =
            entry.requestKey === undefined
                ? this.entries.value
                : this.entries.value.filter((item) => item.requestKey !== entry.requestKey)
        this.entries.value = [...previous, entry].slice(-500)
        // Keep receipt memory bounded along with the actual buffer.
        if (this.seen.size > 1024) this.seen.delete(this.seen.values().next().value!)
    }
    public session(epoch: string | undefined, id: string | undefined): void {
        const key = JSON.stringify([epoch ?? '', id ?? ''])
        if (key !== this.sessionKey) {
            this.sessionKey = key
            this.entries.value = []
            this.seen.clear()
            this.snapshot = undefined
        }
        this.playerId = id
    }
    private status(value: NpcRequestStatus, name?: string): void {
        this.add({
            id: `status:${value.npcId}:${value.id}:${value.state}:${value.at}`,
            channel: 'status',
            requestKey: JSON.stringify([value.npcId, value.id]),
            name:
                name ??
                this.snapshot?.characters.find((actor) => actor.id === value.npcId)?.nickname ??
                'Персонаж',
            text: requestText(value),
            at: value.at,
        })
    }
    public observe(world: WorldSnapshot, id: string | undefined): void {
        this.session(world.serverEpoch, id)
        this.snapshot = world
        if (!id) return
        const messages =
            world.social?.privateMessages ??
            world.social?.whisper?.messages.map((message) => ({
                ...message,
                partnerId: world.social!.whisper!.partnerId,
                partnerName: world.social!.whisper!.partnerName,
                senderName: world.social!.whisper!.partnerName,
            })) ??
            []
        for (const message of messages)
            this.add({
                id: `private:${message.id}`,
                channel: 'whisper',
                name: message.senderId === id ? 'Вы' : message.senderName,
                text: message.text,
                at: message.at,
                partnerId: message.partnerId,
                partnerName: message.partnerName,
            })
        world.social?.requestStatuses?.forEach((value) => this.status(value))
    }
    public event(value: GameEventPayload): void {
        if (!this.playerId) return
        if (value.kind === 'npc_request_status' && value.requestStatus) {
            this.status(value.requestStatus, value.speakerName)
            return
        }
        if (value.kind !== 'chat' || !value.text || value.channel === 'whisper') return
        const receipt = value.speechId ?? `local${++this.fallback}`
        this.add(speechEntry(value, value.text, receipt, this.snapshot, this.playerId))
    }
}

export function createChatHistory() {
    return new ChatHistory()
}

function speechName(
    event: GameEventPayload,
    snapshot: WorldSnapshot | undefined,
    playerId: string
): string {
    if (event.actorId === playerId) return 'Вы'
    return (
        event.speakerName ??
        snapshot?.characters.find((actor) => actor.id === event.actorId)?.nickname ??
        'Голос рядом'
    )
}

function speechEntry(
    event: GameEventPayload,
    text: string,
    receipt: string | number,
    snapshot: WorldSnapshot | undefined,
    playerId: string
): ChatHistoryEntry {
    const personal = event.targetId === playerId && event.actorId !== playerId
    const name = speechName(event, snapshot, playerId)
    return {
        id: `speech:${event.actorId ?? 'unknown'}:${receipt}`,
        channel: personal ? 'whisper' : 'say',
        name,
        text,
        at: Date.now(),
        ...(personal && event.actorId ? { partnerId: event.actorId, partnerName: name } : {}),
    }
}
