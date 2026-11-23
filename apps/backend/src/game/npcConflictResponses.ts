import { THEFT_RULES } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import type { CrimeOffense } from './crimeEvidence'
import {
    advanceCrimeResponse,
    advanceReturningResponses,
    type CrimeResponse,
} from './crimeResponses'
import { available, humanControlled } from './crimeRules'
import { distance } from './math'
import {
    advanceNpcCrimeReport,
    type Report,
    type ReportResponse,
} from './npcCrimeReport'
import {
    grantPersonalHostility,
    revokePersonalHostility,
} from './personalHostility'
import { clearPursuit, pursuits, returnFromPursuit } from './pursuitState'
import type { GameRoom } from './room'

export interface NpcConflictIdentity {
    id: string
    kind: CrimeOffense | 'insult' | 'threat'
    locationId: string
}
type CombatResponse = CrimeResponse & {
    cause: NpcConflictIdentity
    offender: GameCharacter
}
type Response = (CombatResponse | ReportResponse) & {
    leaseReleaseBy?: number
}
const LEASE_RELEASE_GRACE_MS = 2_000

/** One movement intention per NPC. Official guard duties take priority. */
export class NpcConflictResponses {
    private readonly active = new Map<GameCharacter, Response>()
    private readonly returning = new Set<string>()

    public controls(actor: GameCharacter, now: number): boolean {
        return (
            (this.active.get(actor)?.until ?? 0) > now ||
            this.returning.has(actor.id)
        )
    }

    public canReconsider(
        actor: GameCharacter,
        incidentId: string,
        now: number
    ): boolean {
        if (this.returning.has(actor.id)) {
            return false
        }
        const response = this.active.get(actor)
        return (
            response === undefined ||
            response.until <= now ||
            (response.mode !== 'report' && response.cause.id === incidentId)
        )
    }

    public fleeingFrom(
        actor: GameCharacter,
        incidentId: string
    ): GameCharacter['position'] | undefined {
        const response = this.active.get(actor)
        return response?.mode === 'flee' && response.cause.id === incidentId
            ? response.lastKnown
            : undefined
    }

    public cancelCombat(actor: GameCharacter): void {
        const response = this.active.get(actor)
        if (response !== undefined && response.mode !== 'report') {
            this.finish(actor, response)
        }
    }

    public beginCombat(
        actor: GameCharacter,
        offender: GameCharacter,
        mode: 'fight' | 'flee',
        cause: NpcConflictIdentity,
        now: number
    ): void {
        this.replace(actor, {
            cause,
            offender,
            thiefId: offender.id,
            locationId: cause.locationId,
            until: now + THEFT_RULES.retaliationMs,
            mode,
            lastKnown: { ...offender.position },
            lastPlanAt: -Infinity,
        })
    }

    public beginReport(
        actor: GameCharacter,
        offender: GameCharacter,
        guard: GameCharacter,
        offense: CrimeOffense,
        until: number
    ): void {
        this.replace(actor, {
            mode: 'report',
            offenderId: offender.id,
            guardId: guard.id,
            offense,
            locationId: actor.locationId,
            until,
            lastPlanAt: -Infinity,
        })
    }

    private replace(actor: GameCharacter, next: Response): void {
        const previous = this.active.get(actor)
        if (previous?.mode === 'fight') {
            revokePersonalHostility(actor, previous.offender, previous.cause.id)
        }
        this.returning.delete(actor.id)
        this.active.set(actor, next)
    }

    public clearRelatedCrimes(offender: GameCharacter): void {
        for (const [actor, response] of this.active) {
            if (relatedCrime(response, offender)) {
                this.finish(actor, response)
            }
        }
    }

    public update(
        room: GameRoom,
        characters: Iterable<GameCharacter>,
        now: number,
        controlled: Set<string>,
        report: Report
    ): void {
        if (this.active.size === 0 && this.returning.size === 0) {
            return
        }
        const all = new Map(
            Array.from(characters, (actor) => [actor.id, actor])
        )
        for (const [actor, response] of this.active) {
            const bodyBusy =
                controlled.has(actor.id) ||
                room.social.exchanges.isPaused(actor.id)
            if (!currentResponse(actor, response, all, now)) {
                this.finish(actor, response, !bodyBusy)
                continue
            }
            if (!takePhysicalControl(room, actor, response, now) || bodyBusy) {
                continue
            }
            if (this.advance(room, actor, response, all, now, report)) {
                controlled.add(actor.id)
            } else {
                this.finish(actor, response)
            }
        }
        advanceReturningResponses(this.returning, room, all, now, controlled)
    }

    private advance(
        room: GameRoom,
        actor: GameCharacter,
        response: Response,
        all: ReadonlyMap<string, GameCharacter>,
        now: number,
        report: Report
    ): boolean {
        if (
            response.mode === 'fight' &&
            actor.soul.companion?.leaderId === response.thiefId
        ) {
            clearPursuit(actor)
            return false
        }
        if (response.lastPlanAt === -Infinity) {
            cancelCharacterControl(actor)
            clearPursuit(actor)
            response.lastPlanAt = now
            if (response.mode === 'fight') {
                grantPersonalHostility(
                    actor,
                    response.offender,
                    response.cause.id,
                    response.until
                )
            }
        }
        if (response.mode === 'report') {
            return advanceNpcCrimeReport(
                room,
                actor,
                response,
                all,
                now,
                report
            )
        }
        const offender = all.get(response.thiefId)
        if (!available(offender)) {
            return false
        }
        if (
            response.mode === 'flee' &&
            !stillFleeing(actor, offender, response)
        ) {
            return false
        }
        return advanceCrimeResponse(actor, offender, response, room, now)
    }

    private finish(
        actor: GameCharacter,
        response: Response,
        clearMovement = true
    ): void {
        this.active.delete(actor)
        if (response.mode === 'fight') {
            revokePersonalHostility(actor, response.offender, response.cause.id)
        }
        if (
            !clearMovement ||
            humanControlled(actor) ||
            actor.soul.controlSource === 'model' ||
            response.lastPlanAt === -Infinity
        ) {
            return
        }
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        if (pursuits.has(actor)) {
            returnFromPursuit(actor)
            this.returning.add(actor.id)
        }
    }
}

function currentResponse(
    actor: GameCharacter,
    response: Response,
    all: ReadonlyMap<string, GameCharacter>,
    now: number
): boolean {
    return (
        all.get(actor.id) === actor &&
        available(actor) &&
        !humanControlled(actor) &&
        now < response.until &&
        now < (response.leaseReleaseBy ?? Infinity)
    )
}

function takePhysicalControl(
    room: GameRoom,
    actor: GameCharacter,
    response: Response,
    now: number
): boolean {
    if (
        actor.soul.controlSource !== 'script' &&
        response.leaseReleaseBy === undefined
    ) {
        response.leaseReleaseBy = now + LEASE_RELEASE_GRACE_MS
        room.cancelNpcModelTurn(actor.id, now)
    }
    if (actor.soul.controlSource === 'script') {
        delete response.leaseReleaseBy
        return true
    }
    return false
}

function relatedCrime(response: Response, offender: GameCharacter): boolean {
    return response.mode === 'report'
        ? response.offenderId === offender.id
        : response.offender === offender &&
              (response.cause.kind === 'theft' ||
                  response.cause.kind === 'attack')
}

function stillFleeing(
    actor: GameCharacter,
    offender: GameCharacter,
    response: CombatResponse
): boolean {
    return (
        actor.locationId === response.locationId &&
        offender.locationId === response.locationId &&
        distance(actor.position, response.lastKnown) < 96
    )
}
