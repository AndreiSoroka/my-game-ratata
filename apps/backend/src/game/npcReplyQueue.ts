import type { GameCharacter } from './character'

export type NpcConversationSource = 'panel' | 'say' | 'whisper'

const humDelayMs = 2_000
const replyLimitMs = 60_000
const requestWindowMs = 30_000
const requestsPerWindow = 4

export interface PendingNpcReply {
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

/** Private turns stay exclusive. Public replies occupy independent player–NPC pairs. */
export class NpcReplyQueue {
    private readonly pending = new Map<
        string,
        Map<string | null, PendingNpcReply>
    >()
    private readonly requests = new Map<string, number[]>()
    private sequence = 0

    public add(
        recipient: GameCharacter,
        npc: GameCharacter,
        source: NpcConversationSource,
        at: number,
        wallNow: number,
        performModel: boolean
    ): PendingNpcReply {
        const turn: PendingNpcReply = {
            id: `npc-dialogue:${String(++this.sequence)}`,
            actorId: npc.id,
            deathSequence: npc.deathSequence,
            locationId: npc.locationId,
            recipientDeathSequence: recipient.deathSequence,
            recipientName: recipient.nickname,
            source,
            dueAt: at + humDelayMs,
            deadline: wallNow + replyLimitMs,
            ...(performModel ? {} : { humAt: at + humDelayMs }),
        }
        const turns =
            this.pending.get(recipient.id) ??
            new Map<string | null, PendingNpcReply>()
        turns.set(slot(source, npc.id), turn)
        this.pending.set(recipient.id, turns)
        return turn
    }

    public get(
        recipientId: string,
        source: NpcConversationSource,
        actorId: string
    ) {
        return this.pending.get(recipientId)?.get(slot(source, actorId))
    }

    public forRecipient(recipientId: string) {
        return this.pending.get(recipientId)?.values() ?? []
    }

    public *entries(): IterableIterator<[string, PendingNpcReply]> {
        for (const [recipientId, turns] of this.pending) {
            for (const turn of turns.values()) {
                yield [recipientId, turn]
            }
        }
    }

    public remove(recipientId: string, turn: PendingNpcReply): void {
        const turns = this.pending.get(recipientId)
        turns?.delete(slot(turn.source, turn.actorId))
        if (turns?.size === 0) {
            this.pending.delete(recipientId)
        }
    }

    public allowRequest(id: string, now: number): boolean {
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

    public expireRequests(now: number): void {
        for (const [id, requests] of this.requests) {
            if ((requests.at(-1) ?? 0) <= now - requestWindowMs) {
                this.requests.delete(id)
            }
        }
    }
}

function slot(source: NpcConversationSource, actorId: string): string | null {
    return source === 'say' ? actorId : null
}
