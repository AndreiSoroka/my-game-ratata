import {
    detectSpeechLanguage,
    PUBLIC_SPEECH_RADIUS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canReact } from './npcConflictObservation'
import {
    opensWithWarning,
    type SpeechWarningTrigger,
    warningOpenings,
} from './npcWarningSpeech'
import type { GameRoom } from './room'
import type { NpcHeardSpeech } from './roomNpcConversations'
import { canConverseWithNpc } from './socialSpeech'
import { attributeNpcSpeech, createSpeechEvent } from './speechReceipts'

const fallbackDelayMs = 8_000
const receiptLifetimeMs = 60_000

interface PendingWarning {
    actor: GameCharacter
    recipient: GameCharacter
    actorDeathSequence: number
    recipientDeathSequence: number
    event: NpcHeardSpeech
    trigger: SpeechWarningTrigger
    fallbackAt: number
}

/** A received prompt permits a fallback; only published speech settles the warning. */
export class RoomSpeechWarnings {
    private readonly pending = new Map<string, PendingWarning>()
    private readonly settled = new Map<
        string,
        { actor: GameCharacter; until: number }
    >()

    public constructor(
        private readonly room: GameRoom,
        private readonly hasPhysicalReaction: (
            actor: GameCharacter,
            now: number
        ) => boolean
    ) {}

    public respond(
        actor: GameCharacter,
        event: NpcHeardSpeech,
        trigger: SpeechWarningTrigger,
        model: boolean
    ): void {
        const recipient = this.room.getCharacter(event.senderId)
        if (recipient === undefined) {
            return
        }
        const realNow = this.room.realNow()
        const pending: PendingWarning = {
            actor,
            recipient,
            actorDeathSequence: actor.deathSequence,
            recipientDeathSequence: recipient.deathSequence,
            event,
            trigger,
            fallbackAt: realNow + fallbackDelayMs,
        }
        const id = key(actor, event)
        if (this.hasPhysicalReaction(actor, event.at)) {
            this.finish(id, pending, realNow, event.at, false)
        } else if (model) {
            this.pending.set(id, pending)
        } else {
            this.finish(id, pending, realNow, event.at, true)
        }
    }

    public isPending(actor: GameCharacter, event: NpcHeardSpeech): boolean {
        return this.pending.get(key(actor, event))?.actor === actor
    }

    public bindTurn(actor: GameCharacter, event: NpcHeardSpeech): void {
        const pending = this.pending.get(key(actor, event))
        if (pending?.actor === actor) {
            pending.event = event
        }
    }

    public settle(
        actor: GameCharacter,
        event: NpcHeardSpeech,
        text: string
    ): void {
        const id = key(actor, event)
        const pending = this.pending.get(id)
        if (
            pending?.actor === actor &&
            this.matchesWarning(pending, event, text)
        ) {
            this.pending.delete(id)
            this.settled.set(id, {
                actor,
                until: this.room.realNow() + receiptLifetimeMs,
            })
        }
    }

    public isSettled(actor: GameCharacter, event: NpcHeardSpeech): boolean {
        return this.settled.get(key(actor, event))?.actor === actor
    }

    public suppressModelReply(
        actor: GameCharacter,
        event: NpcHeardSpeech,
        text: string,
        now: number
    ): boolean {
        if (this.isSettled(actor, event)) {
            return true
        }
        const id = key(actor, event)
        const pending = this.pending.get(id)
        if (pending?.actor !== actor) {
            return false
        }
        if (this.hasPhysicalReaction(actor, now)) {
            this.finish(id, pending, this.room.realNow(), now, false)
            return true
        }
        return !this.matchesWarning(pending, event, text)
    }

    public cancelFor(actor: GameCharacter, now: number): void {
        for (const [id, pending] of this.pending) {
            if (pending.actor === actor) {
                this.finish(id, pending, this.room.realNow(), now, false)
            }
        }
    }

    public advance(realNow: number, gameNow: number): void {
        for (const [id, receipt] of this.settled) {
            if (receipt.until <= realNow) {
                this.settled.delete(id)
            }
        }
        for (const [id, pending] of this.pending) {
            if (this.hasPhysicalReaction(pending.actor, gameNow)) {
                this.finish(id, pending, realNow, gameNow, false)
            } else if (realNow >= pending.fallbackAt) {
                this.finish(id, pending, realNow, gameNow, true)
            }
        }
    }

    private finish(
        id: string,
        pending: PendingWarning,
        realNow: number,
        gameNow: number,
        deliver: boolean
    ): void {
        this.pending.delete(id)
        this.settled.set(id, {
            actor: pending.actor,
            until: realNow + receiptLifetimeMs,
        })
        if (
            (!deliver || !this.deliver(pending, gameNow)) &&
            pending.event.conversationId !== undefined
        ) {
            this.room.social.npcSpeech.turns.reply(
                pending.actor,
                pending.event,
                '',
                gameNow
            )
        }
    }

    private matchesWarning(
        pending: PendingWarning,
        event: NpcHeardSpeech,
        text: string
    ): boolean {
        const language = event.language ?? this.room.localeFor(event.senderId)
        return opensWithWarning(text, pending.trigger, language)
    }

    private deliver(pending: PendingWarning, now: number): boolean {
        if (!this.canDeliver(pending, now)) {
            return false
        }
        const { actor, recipient, event } = pending
        const language =
            event.language ??
            detectSpeechLanguage(event.text) ??
            this.room.localeFor(recipient.id)
        const [text] = warningOpenings(pending.trigger, language)
        if (event.conversationId !== undefined) {
            return this.room.social.npcSpeech.turns.reply(
                actor,
                { ...event, language },
                text,
                now
            )
        }
        if (event.channel === 'whisper') {
            return this.room.social.whispers.send(actor, recipient, text, now, {
                language,
                keepOriginalForRecipient: true,
            })
        }
        const speech = createSpeechEvent(actor, text)
        this.room.publishEvents([
            attributeNpcSpeech(
                { ...speech, channel: 'say', language },
                recipient.id
            ),
        ])
        return true
    }

    private canDeliver(pending: PendingWarning, now: number): boolean {
        const {
            actor,
            recipient,
            event,
            actorDeathSequence,
            recipientDeathSequence,
        } = pending
        const radius = event.channel === 'whisper' ? 48 : PUBLIC_SPEECH_RADIUS
        return (
            this.room.getCharacter(actor.id) === actor &&
            this.room.getCharacter(recipient.id) === recipient &&
            actor.deathSequence === actorDeathSequence &&
            recipient.deathSequence === recipientDeathSequence &&
            canReact(actor, recipient, event.locationId) &&
            canConverseWithNpc(
                actor,
                recipient,
                this.room.navigationFor(actor),
                now,
                radius
            )
        )
    }
}

function key(actor: GameCharacter, event: NpcHeardSpeech): string {
    return JSON.stringify([actor.id, event.id])
}
