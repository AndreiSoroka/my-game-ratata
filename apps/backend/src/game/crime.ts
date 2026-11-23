import {
    type GameEventPayload,
    THEFT_RULES,
    type TheftAccusation,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    absolve,
    type JusticeContext,
    reportTheft,
    visibleCityCriminal,
} from './cityJustice'
import { CrimeEvidence } from './crimeEvidence'
import { grantRetaliation, revokeRetaliation } from './crimeRelations'
import { activeResponse, validAccusation } from './crimeResponseRules'
import {
    advanceCrimeResponse,
    advanceReturningResponses,
    type CrimeResponse,
} from './crimeResponses'
import { available, cityGuard, humanControlled } from './crimeRules'
import { distance } from './math'
import { pursuits, returnFromPursuit } from './pursuitState'
import type { GameRoom } from './room'
import { privateTheftNotice } from './theftEvents'

export class CrimeService {
    private readonly evidence = new CrimeEvidence()
    private readonly blacklisted = new Map<string, GameCharacter>()
    private readonly responses = new Map<string, CrimeResponse>()
    private readonly wanted = new Map<string, number>()
    private readonly returning = new Set<string>()

    public record(
        thief: GameCharacter,
        victim: GameCharacter,
        characters: Iterable<GameCharacter>,
        now: number
    ): GameEventPayload[] {
        this.evidence.record(thief, victim, now)
        grantRetaliation(victim, thief, now + THEFT_RULES.retaliationMs)
        const events = [
            privateTheftNotice(
                victim.id,
                `${thief.nickname} пытался обокрасть тебя. Можно защищаться и позвать стражу.`,
                thief.id
            ),
        ]
        if (humanControlled(victim)) {
            return events
        }
        const fighter =
            victim.soul.companion?.canFight ?? victim.faction === 'monsters'
        this.respond(
            victim,
            thief,
            fighter ? 'fight' : 'flee',
            now,
            thief.position
        )
        if (victim.soul.canSpeak) {
            events.push(
                privateTheftNotice(
                    thief.id,
                    'Попытку кражи заметили.',
                    victim.id
                )
            )
            if (!fighter) {
                events.push(
                    ...this.callGuards(victim, thief.id, characters, now)
                )
            }
        }
        return events
    }

    public callGuards(
        actor: GameCharacter,
        thiefId: string,
        characters: Iterable<GameCharacter>,
        now: number
    ): GameEventPayload[] {
        const all = [...characters]
        const thief = all.find((character) => character.id === thiefId)
        const proof = this.evidence.get(actor.id, thiefId)
        if (proof === undefined || !validAccusation(actor, thief, proof, now)) {
            return [
                privateTheftNotice(
                    actor.id,
                    'Нет свежего свидетельства кражи в этой локации.'
                ),
            ]
        }
        if (proof.called) {
            return []
        }
        const guard = all.find(
            (character) =>
                character.id !== thiefId &&
                cityGuard(character) &&
                !humanControlled(character) &&
                available(character) &&
                character.locationId === actor.locationId &&
                distance(actor.position, character.position) <=
                    THEFT_RULES.guardHearingRadius
        )
        if (guard === undefined) {
            return [
                privateTheftNotice(
                    actor.id,
                    'Поблизости нет стражи, которая услышит зов.'
                ),
            ]
        }
        proof.called = true
        this.wanted.set(thief.id, now + THEFT_RULES.retaliationMs)
        grantRetaliation(guard, thief, now + THEFT_RULES.retaliationMs)
        this.respond(guard, thief, 'fight', now, proof.position)
        return [
            privateTheftNotice(actor.id, 'Стража вызвана.', guard.id),
            privateTheftNotice(
                thief.id,
                'Стража Новогорода получила сообщение о краже.',
                guard.id
            ),
        ]
    }

    public snapshotAccusations(
        actorId: string,
        now: number
    ): TheftAccusation[] {
        return this.evidence.snapshot(actorId, now)
    }

    public report(
        actor: GameCharacter,
        thiefId: string,
        context: JusticeContext
    ): GameEventPayload[] {
        const events = reportTheft(actor, thiefId, this.evidence, context)
        const thief = [...context.characters].find(
            (candidate) => candidate.id === thiefId
        )
        if (thief?.tags.has('city.blacklisted') === true) {
            this.blacklisted.set(thiefId, thief)
        }
        return events
    }

    public absolve(
        actor: GameCharacter,
        clericId: string,
        context: JusticeContext
    ): GameEventPayload[] {
        return absolve(actor, clericId, context, () =>
            this.clear(actor, context.characters)
        )
    }

    public isBlacklisted(actorId: string): boolean {
        const actor = this.blacklisted.get(actorId)
        return (
            actor !== undefined &&
            !actor.tags.has('state.retired') &&
            actor.tags.has('city.blacklisted')
        )
    }

    public wantedMsLeft(actorId: string, now: number): number {
        return Math.max(0, (this.wanted.get(actorId) ?? 0) - now)
    }

    public update(
        room: GameRoom,
        characters: Iterable<GameCharacter>,
        now: number
    ): Set<string> {
        const controlled = new Set<string>()
        const all = new Map(
            [...characters].map((character) => [character.id, character])
        )
        this.evidence.prune(all, now)
        for (const character of all.values()) {
            if (character.tags.has('state.retired')) {
                this.clear(character, all.values())
            }
        }
        for (const thief of this.blacklisted.values()) {
            if (!all.has(thief.id)) {
                this.clear(thief, all.values())
            }
        }
        this.patrol(room, all, now)
        for (const [id, response] of this.responses) {
            const actor = all.get(id)
            const thief = all.get(response.thiefId)
            if (
                thief === undefined ||
                !activeResponse(actor, thief, response, now)
            ) {
                if (actor !== undefined && !humanControlled(actor)) {
                    actor.clearPath()
                    this.sendHome(actor)
                }
                this.responses.delete(id)
                continue
            }
            if (advanceCrimeResponse(actor, thief, response, room, now)) {
                controlled.add(id)
            } else {
                this.responses.delete(id)
            }
        }
        advanceReturningResponses(this.returning, room, all, now, controlled)
        return controlled
    }

    private patrol(
        room: GameRoom,
        characters: Map<string, GameCharacter>,
        now: number
    ): void {
        for (const guard of characters.values()) {
            if (pursuits.get(guard)?.phase === 'return') {
                continue
            }
            const thief = visibleCityCriminal(
                guard,
                characters.values(),
                room,
                now
            )
            if (thief === undefined) {
                continue
            }
            grantRetaliation(guard, thief, now + THEFT_RULES.retaliationMs)
            const response = this.responses.get(guard.id)
            if (response?.thiefId === thief.id) {
                response.until = now + THEFT_RULES.retaliationMs
            } else {
                this.respond(guard, thief, 'fight', now, thief.position)
            }
        }
    }

    private clear(
        thief: GameCharacter,
        characters: Iterable<GameCharacter>
    ): void {
        thief.tags.delete('city.blacklisted')
        this.blacklisted.delete(thief.id)
        this.wanted.delete(thief.id)
        this.evidence.forgetThief(thief.id)
        for (const other of characters) {
            revokeRetaliation(thief, other)
            if (this.responses.get(other.id)?.thiefId !== thief.id) {
                continue
            }
            this.responses.delete(other.id)
            if (!humanControlled(other)) {
                other.clearPath()
                this.sendHome(other)
            }
        }
    }

    private sendHome(actor: GameCharacter): void {
        if (pursuits.has(actor)) {
            returnFromPursuit(actor)
            this.returning.add(actor.id)
        }
    }

    private respond(
        actor: GameCharacter,
        thief: GameCharacter,
        mode: CrimeResponse['mode'],
        now: number,
        position: Vector2
    ): void {
        if (humanControlled(actor)) {
            return
        }
        actor.setMoveInput({ x: 0, y: 0 })
        actor.clearPath()
        this.responses.set(actor.id, {
            thiefId: thief.id,
            locationId: actor.locationId,
            until: now + THEFT_RULES.retaliationMs,
            mode,
            lastKnown: { ...position },
            lastPlanAt: 0,
        })
    }
}
