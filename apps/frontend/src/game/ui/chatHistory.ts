import type {
    GameEventPayload,
    HeardPrivateSpeech,
    NpcRequestStatus,
    SpeechTranslation,
    SpeechTranslationServerMessage,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { ref } from 'vue'

import type { ChatHistoryEntry } from '@/entities/chats'
import { tGame, tLocalized } from '@/shared/lib/i18n'

const requestLabels = {
    heard: 'game.chat.statusHeard',
    queued: 'game.chat.statusQueued',
    thinking: 'game.chat.statusThinking',
    accepted: 'game.chat.statusAccepted',
    declined: 'game.chat.statusDeclined',
    started: 'game.chat.statusStarted',
    completed: 'game.chat.statusCompleted',
    failed: 'game.chat.statusFailed',
    undelivered: 'game.chat.statusUndelivered',
    cancelled: 'game.chat.statusCancelled',
} as const satisfies Record<NpcRequestStatus['state'], string>

function requestText(value: NpcRequestStatus): string {
    const label = tGame(requestLabels[value.state])
    const named = ['thinking', 'accepted', 'declined', 'started', 'failed', 'cancelled'].includes(
        value.state
    )
    const request = named && value.request ? `: «${value.request}»` : ''
    const detail = tLocalized(value.reasonMessage, value.reason ?? '')
    const reason = detail ? `${request ? '. ' : ': '}${detail}` : ''
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
            if (entry.translation) this.patchTranslation(entry.id, entry.translation)
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
    private patchTranslation(id: string, translation: SpeechTranslation): void {
        const previous = this.entries.value.find((entry) => entry.id === id)
        if (
            previous === undefined ||
            (previous.translation?.locale === translation.locale &&
                previous.translation.text === translation.text)
        )
            return
        previous.translation = translation
    }
    public translate({ actorId, speechId, locale, text }: SpeechTranslationServerMessage): void {
        this.patchTranslation(`speech:${actorId}:${speechId}`, { locale, text })
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
            actorId: value.npcId,
            requestKey: JSON.stringify([value.npcId, value.id]),
            name:
                name ??
                this.snapshot?.characters.find((actor) => actor.id === value.npcId)?.nickname ??
                tGame('game.chat.character'),
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
        for (const message of messages) this.add(privateEntry(message, id))
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

function privateEntry(message: HeardPrivateSpeech, playerId: string): ChatHistoryEntry {
    const self = message.senderId === playerId
    return {
        id: `private:${message.id}`,
        channel: 'whisper',
        actorId: message.senderId,
        name: self ? tGame('game.chat.you') : message.senderName,
        self,
        text: message.text,
        ...(message.language === undefined ? {} : { language: message.language }),
        ...(message.textMessage === undefined ? {} : { textMessage: message.textMessage }),
        ...(message.translation === undefined ? {} : { translation: message.translation }),
        at: message.at,
        partnerId: message.partnerId,
        partnerName: message.partnerName,
    }
}

function speechName(
    event: GameEventPayload,
    snapshot: WorldSnapshot | undefined,
    playerId: string
): string {
    if (event.actorId === playerId) return tGame('game.chat.you')
    return (
        event.speakerName ??
        snapshot?.characters.find((actor) => actor.id === event.actorId)?.nickname ??
        tGame('game.chat.nearbyVoice')
    )
}

function speechEntry(
    event: GameEventPayload,
    text: string,
    receipt: string | number,
    snapshot: WorldSnapshot | undefined,
    playerId: string
): ChatHistoryEntry {
    const personal =
        event.channel === undefined && event.targetId === playerId && event.actorId !== playerId
    const name = speechName(event, snapshot, playerId)
    return {
        id: `speech:${event.actorId ?? 'unknown'}:${receipt}`,
        channel: personal ? 'whisper' : 'say',
        ...(event.actorId === undefined ? {} : { actorId: event.actorId }),
        name,
        text,
        ...(event.actorId === playerId ? { self: true } : {}),
        ...(event.language === undefined ? {} : { language: event.language }),
        ...(event.textMessage === undefined ? {} : { textMessage: event.textMessage }),
        ...(event.workerActivity === undefined ? {} : { workerActivity: event.workerActivity }),
        at: Date.now(),
        ...(personal && event.actorId ? { partnerId: event.actorId, partnerName: name } : {}),
    }
}
