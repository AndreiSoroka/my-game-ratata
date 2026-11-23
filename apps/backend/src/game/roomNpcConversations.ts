import type {
    GameLocale,
    SpeechActivitySnapshot,
} from '@my-game-ratata/contracts'

import type { NpcAiEvent } from '../ai/types'
import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { RoomConversationDepartures } from './roomConversationDepartures'
import { canConverseWithNpc } from './socialSpeech'
import {
    attributeNpcSpeech,
    createDialogueSpeechEvent,
    createSpeechEvent,
} from './speechReceipts'
import type { WhisperService } from './whispers'

export type NpcHeardSpeech = Extract<NpcAiEvent, { kind: 'message' }>
export type NpcConversationSource = 'panel' | 'say' | 'whisper'
export const NPC_HUM = 'М-м-м-м-м…'
const humDelayMs = 2_000
const replyLimitMs = 60_000
const requestWindowMs = 30_000
const requestsPerWindow = 4

interface PendingReply {
    actorId: string
    deathSequence: number
    locationId: string
    recipientDeathSequence: number
    recipientName: string
    id: string
    source: NpcConversationSource
    dueAt: number
    humAt?: number
    deadline: number
}

/** Each player has one addressed turn, bound to both living identities. */
export class RoomNpcConversations {
    public readonly departures: RoomConversationDepartures
    private readonly pending = new Map<string, PendingReply>()
    private readonly requests = new Map<string, number[]>()
    private sequence = 0

    public constructor(
        private readonly room: GameRoom,
        private readonly adventure: AdventureService,
        private readonly whispers: WhisperService
    ) {
        this.departures = new RoomConversationDepartures(room)
    }

    public enqueue(
        recipient: GameCharacter,
        npc: GameCharacter,
        event: NpcHeardSpeech,
        source: NpcConversationSource,
        useModel: boolean
    ): NpcHeardSpeech | undefined {
        const id = `npc-dialogue:${String(++this.sequence)}`
        const wallNow = this.room.realNow()
        const performModel = useModel && this.takeRequest(recipient.id, wallNow)
        const turn: PendingReply = {
            actorId: npc.id,
            deathSequence: npc.deathSequence,
            locationId: npc.locationId,
            recipientDeathSequence: recipient.deathSequence,
            recipientName: recipient.nickname,
            source,
            id,
            dueAt: event.at + humDelayMs,
            deadline: wallNow + replyLimitMs,
            ...(performModel ? {} : { humAt: event.at + humDelayMs }),
        }
        const previous = this.pending.get(recipient.id)
        if (previous !== undefined) {
            const speaker = this.room.getCharacter(previous.actorId)
            if (
                previous.actorId !== npc.id ||
                this.currentRecipient(
                    recipient.id,
                    previous,
                    speaker,
                    event.at
                ) === undefined
            ) {
                this.discard(recipient.id, previous, speaker)
            }
        }
        this.pending.set(recipient.id, turn)
        return performModel
            ? { ...event, conversationId: id, replyDeadline: turn.deadline }
            : undefined
    }

    public close(
        actorId: string | undefined,
        source?: NpcConversationSource,
        keepTargetId?: string
    ): void {
        if (actorId === undefined) {
            return
        }
        for (const [recipientId, turn] of this.pending) {
            if (
                (actorId === recipientId || actorId === turn.actorId) &&
                (source === undefined || turn.source === source) &&
                turn.actorId !== keepTargetId
            ) {
                this.discard(
                    recipientId,
                    turn,
                    actorId === recipientId
                        ? this.room.getCharacter(turn.actorId)
                        : undefined
                )
            }
        }
    }

    public available(
        npc: GameCharacter,
        event: NpcHeardSpeech,
        now: number
    ): boolean {
        if (event.conversationId === undefined) {
            return true
        }
        const turn = this.pending.get(event.senderId)
        return (
            turn?.id === event.conversationId &&
            turn.actorId === npc.id &&
            turn.humAt === undefined &&
            turn.deadline > this.room.realNow() &&
            this.currentRecipient(event.senderId, turn, npc, now) !== undefined
        )
    }

    public fail(recipientId: string, id: string, now: number): void {
        const turn = this.pending.get(recipientId)
        if (turn?.id === id) {
            turn.humAt = Math.max(turn.dueAt, now)
        }
    }

    public reply(
        npc: GameCharacter,
        event: NpcHeardSpeech,
        text: string,
        now: number
    ): boolean {
        if (
            event.conversationId === undefined ||
            !this.available(npc, event, now)
        ) {
            return false
        }
        const turn = this.pending.get(event.senderId)
        const recipient = this.room.getCharacter(event.senderId)
        if (turn !== undefined && recipient !== undefined) {
            if (text === '') {
                this.pending.delete(recipient.id)
            } else {
                return this.deliver(
                    npc,
                    recipient,
                    turn,
                    text,
                    now,
                    event.language ?? this.room.localeFor(recipient.id)
                )
            }
        }
        return false
    }

    public activity(
        recipient: GameCharacter,
        now: number
    ): SpeechActivitySnapshot[] {
        const turn = this.pending.get(recipient.id)
        if (turn === undefined) {
            return []
        }
        const npc = this.room.getCharacter(turn.actorId)
        return this.currentRecipient(recipient.id, turn, npc, now) === undefined
            ? []
            : [
                  {
                      actorId: turn.actorId,
                      id: turn.id,
                      kind: turn.humAt === undefined ? 'thinking' : 'typing',
                  },
              ]
    }

    public advance(now: number): void {
        const wallNow = this.room.realNow()
        for (const [id, requests] of this.requests) {
            if ((requests.at(-1) ?? 0) <= wallNow - requestWindowMs) {
                this.requests.delete(id)
            }
        }
        for (const [recipientId, turn] of this.pending) {
            const npc = this.room.getCharacter(turn.actorId)
            const recipient = this.currentRecipient(recipientId, turn, npc, now)
            if (npc === undefined || recipient === undefined) {
                this.discard(recipientId, turn, npc)
            } else if (turn.humAt === undefined && wallNow >= turn.deadline) {
                this.deliver(npc, recipient, turn, NPC_HUM, now)
            } else if (turn.humAt !== undefined && now >= turn.humAt) {
                this.deliver(npc, recipient, turn, NPC_HUM, now)
            }
        }
    }

    private discard(
        recipientId: string,
        turn: PendingReply,
        npc: GameCharacter | undefined
    ): void {
        this.pending.delete(recipientId)
        if (npc?.alive === true && npc.deathSequence === turn.deathSequence) {
            this.departures.record(npc, {
                id: turn.id,
                npcId: npc.id,
                npcName: npc.nickname,
                listenerId: recipientId,
                listenerName: turn.recipientName,
                at: this.room.gameplayNow(),
            })
        }
    }

    private takeRequest(id: string, now: number): boolean {
        const recent = (this.requests.get(id) ?? []).filter(
            (at) => at > now - requestWindowMs
        )
        if (recent.length >= requestsPerWindow) {
            return false
        }
        recent.push(now)
        this.requests.set(id, recent)
        return true
    }

    private currentRecipient(
        recipientId: string,
        turn: PendingReply,
        npc: GameCharacter | undefined,
        now: number
    ): GameCharacter | undefined {
        const recipient = this.room.getCharacter(recipientId)
        if (
            npc?.deathSequence !== turn.deathSequence ||
            npc.locationId !== turn.locationId ||
            recipient?.deathSequence !== turn.recipientDeathSequence ||
            (turn.source === 'panel' &&
                this.adventure.walletFor(recipientId).dialogue?.npcId !==
                    npc.id) ||
            !canConverseWithNpc(
                recipient,
                npc,
                this.room.navigationFor(npc),
                now,
                turn.source === 'say' ? 80 : 48
            )
        ) {
            return undefined
        }
        return recipient
    }

    private deliver(
        npc: GameCharacter,
        recipient: GameCharacter,
        turn: PendingReply,
        text: string,
        now: number,
        language?: GameLocale
    ): boolean {
        this.pending.delete(recipient.id)
        const line = text.trim().slice(0, 400)
        if (turn.source === 'whisper' && line !== NPC_HUM) {
            return this.whispers.send(npc, recipient, line, now, {
                language: language ?? this.room.localeFor(recipient.id),
                keepOriginalForRecipient: true,
            })
        }
        const event =
            turn.source === 'panel'
                ? createDialogueSpeechEvent(npc, recipient, line)
                : createSpeechEvent(npc, line, {
                      targetId: recipient.id,
                      ...(line === NPC_HUM
                          ? { audienceIds: [recipient.id] }
                          : {}),
                  })
        if (language !== undefined) {
            event.language = language
            attributeNpcSpeech(event, recipient.id)
        }
        const dialogue = this.adventure.walletFor(recipient.id).dialogue
        if (turn.source === 'panel' && dialogue?.npcId === npc.id) {
            delete dialogue.initialView
            delete dialogue.textMessage
            dialogue.text = line
            dialogue.speechId = event.speechId
        }
        this.room.publishEvents([event])
        return true
    }
}
