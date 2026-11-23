import {
    PUBLIC_SPEECH_RADIUS,
    type SpeechActivitySnapshot,
} from '@my-game-ratata/contracts'

import type { NpcAiEvent } from '../ai/types'
import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import {
    type NpcConversationSource,
    NpcReplyQueue,
    type PendingNpcReply,
} from './npcReplyQueue'
import type { GameRoom } from './room'
import { RoomConversationDepartures } from './roomConversationDepartures'
import { createNpcReplyPublisher, NPC_HUM } from './roomNpcReplySpeech'
import { canConverseWithNpc } from './socialSpeech'
import type { WhisperService } from './whispers'

export type NpcHeardSpeech = Extract<NpcAiEvent, { kind: 'message' }>
type PrivateConversationSource = Exclude<NpcConversationSource, 'say'>

/** Private turns stay exclusive; each public speaker can have one turn per NPC. */
export class RoomNpcConversations {
    public readonly departures: RoomConversationDepartures
    private readonly pending = new NpcReplyQueue()
    private readonly publishReply: ReturnType<typeof createNpcReplyPublisher>

    public constructor(
        private readonly room: GameRoom,
        private readonly adventure: AdventureService,
        whispers: WhisperService
    ) {
        this.departures = new RoomConversationDepartures(room)
        this.publishReply = createNpcReplyPublisher({
            room,
            adventure,
            whispers,
        })
    }

    public enqueue(
        recipient: GameCharacter,
        npc: GameCharacter,
        event: NpcHeardSpeech,
        source: PrivateConversationSource,
        useModel: boolean
    ): NpcHeardSpeech | undefined {
        const wallNow = this.room.realNow()
        const performModel =
            useModel && this.pending.allowRequest(recipient.id, wallNow)
        const turn = this.recordTurn(
            recipient,
            npc,
            event,
            source,
            wallNow,
            performModel
        )
        return performModel ? turn : undefined
    }

    public enqueueNearby(
        recipient: GameCharacter,
        npcs: GameCharacter[],
        event: NpcHeardSpeech
    ): Array<{ npc: GameCharacter; speech: NpcHeardSpeech }> {
        const wallNow = this.room.realNow()
        if (
            npcs.length === 0 ||
            !this.pending.allowRequest(recipient.id, wallNow)
        ) {
            return []
        }
        return npcs.map((npc) => ({
            npc,
            speech: this.recordTurn(
                recipient,
                npc,
                event,
                'say',
                wallNow,
                true
            ),
        }))
    }

    private recordTurn(
        recipient: GameCharacter,
        npc: GameCharacter,
        event: NpcHeardSpeech,
        source: NpcConversationSource,
        wallNow: number,
        performModel: boolean
    ): NpcHeardSpeech {
        const previous = this.pending.get(recipient.id, source, npc.id)
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
        const turn = this.pending.add(
            recipient,
            npc,
            source,
            event.at,
            wallNow,
            performModel
        )
        return {
            ...event,
            conversationId: turn.id,
            replyDeadline: turn.deadline,
        }
    }

    public close(
        actorId: string | undefined,
        source?: NpcConversationSource,
        keepTargetId?: string
    ): void {
        if (actorId === undefined) {
            return
        }
        for (const [recipientId, turn] of this.pending.entries()) {
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
        const turn = this.pending.get(
            event.senderId,
            event.nearby === undefined ? 'whisper' : 'say',
            npc.id
        )
        return (
            turn?.id === event.conversationId &&
            turn.actorId === npc.id &&
            turn.humAt === undefined &&
            turn.deadline > this.room.realNow() &&
            this.currentRecipient(event.senderId, turn, npc, now) !== undefined
        )
    }

    public fail(recipientId: string, id: string, now: number): void {
        const turn = [...this.pending.forRecipient(recipientId)].find(
            (entry) => entry.id === id
        )
        if (turn?.source === 'say') {
            this.pending.remove(recipientId, turn)
        } else if (turn !== undefined) {
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
        const turn = this.pending.get(
            event.senderId,
            event.nearby === undefined ? 'whisper' : 'say',
            npc.id
        )
        const recipient = this.room.getCharacter(event.senderId)
        if (turn !== undefined && recipient !== undefined) {
            this.pending.remove(recipient.id, turn)
            if (text !== '') {
                return this.publishReply(
                    npc,
                    recipient,
                    turn.source,
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
        const activities: SpeechActivitySnapshot[] = []
        for (const turn of this.pending.forRecipient(recipient.id)) {
            const npc = this.room.getCharacter(turn.actorId)
            if (
                this.currentRecipient(recipient.id, turn, npc, now) !==
                undefined
            ) {
                activities.push({
                    actorId: turn.actorId,
                    id: turn.id,
                    kind: turn.humAt === undefined ? 'thinking' : 'typing',
                })
            }
        }
        return activities
    }

    public advance(now: number): void {
        const wallNow = this.room.realNow()
        this.pending.expireRequests(wallNow)
        for (const [recipientId, turn] of this.pending.entries()) {
            const npc = this.room.getCharacter(turn.actorId)
            const recipient = this.currentRecipient(recipientId, turn, npc, now)
            if (npc === undefined || recipient === undefined) {
                this.discard(recipientId, turn, npc)
            } else if (
                turn.humAt === undefined
                    ? wallNow >= turn.deadline
                    : now >= turn.humAt
            ) {
                this.pending.remove(recipientId, turn)
                if (turn.source !== 'say') {
                    this.publishReply(npc, recipient, turn.source, NPC_HUM, now)
                }
            }
        }
    }

    private discard(
        recipientId: string,
        turn: PendingNpcReply,
        npc: GameCharacter | undefined
    ): void {
        this.pending.remove(recipientId, turn)
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

    private currentRecipient(
        recipientId: string,
        turn: PendingNpcReply,
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
                turn.source === 'say' ? PUBLIC_SPEECH_RADIUS : 48
            )
        ) {
            return undefined
        }
        return recipient
    }
}
