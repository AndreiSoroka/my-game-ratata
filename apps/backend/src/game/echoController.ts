import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CharacterController } from './controllers'
import { available } from './crimeRules'
import { advanceEchoReturn, type EchoReturn } from './echoReturn'
import { echoSeesHostile, echoWanderDestination } from './echoWandering'
import type { GameRoom } from './room'

const walkMs = 60_000

interface EchoWalk {
    origin: Vector2
    locationId: string
    endsAt: number
    nextStepAt: number
}

type EchoWorld = Pick<GameRoom, 'charactersFor' | 'navigationFor'>

export class EchoController implements CharacterController {
    private walk: EchoWalk | undefined
    private returning: EchoReturn | undefined

    public constructor(
        actor: GameCharacter,
        now: number,
        runningScenario: boolean,
        private readonly random: () => number = Math.random
    ) {
        if (!runningScenario) {
            this.walk = startWalk(actor, now)
        }
    }

    public update(
        actor: GameCharacter,
        room: GameRoom,
        now: number,
        held = false
    ): void {
        if (actor.connected || actor.soul.controlSource !== 'script') {
            return
        }
        if (room.scenarios.running(actor.id)) {
            this.walk = undefined
            this.returning = undefined
            room.scenarios.advance(actor, room, now, held)
            if (room.scenarios.running(actor.id)) {
                return
            }
        }
        if (!available(actor)) {
            return
        }
        this.advanceWalkOrReturn(actor, room, now)
    }

    private advanceWalkOrReturn(
        actor: GameCharacter,
        room: EchoWorld,
        now: number
    ): void {
        const walk = (this.walk ??= startWalk(actor, now))
        if (
            this.returning === undefined &&
            shouldReturn(actor, room, walk, now)
        ) {
            actor.clearPath()
            this.returning = {}
        }
        if (actor.stunUntil > now || actor.isActionLocked(now)) {
            return
        }
        if (this.returning !== undefined) {
            advanceEchoReturn(actor, room, this.returning, now)
        } else {
            this.wander(actor, room, walk, now)
        }
    }

    private wander(
        actor: GameCharacter,
        room: EchoWorld,
        walk: EchoWalk,
        now: number
    ): void {
        if (
            actor.locationId !== walk.locationId ||
            actor.hasPath() ||
            now < walk.nextStepAt
        ) {
            return
        }
        const destination = echoWanderDestination(
            actor,
            walk.origin,
            room.navigationFor(actor),
            this.random
        )
        walk.nextStepAt = now + 1500 + this.random() * 1500
        if (destination !== undefined) {
            actor.setPath([destination])
        }
    }
}

function startWalk(actor: GameCharacter, now: number): EchoWalk {
    return {
        origin: { ...actor.position },
        locationId: actor.locationId,
        endsAt: now + walkMs,
        nextStepAt: now,
    }
}

function shouldReturn(
    actor: GameCharacter,
    room: EchoWorld,
    walk: EchoWalk,
    now: number
): boolean {
    return (
        now >= walk.endsAt ||
        echoSeesHostile(
            actor,
            room.charactersFor(actor),
            room.navigationFor(actor),
            now
        )
    )
}
