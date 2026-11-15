import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import type { GameRoom } from './room'
import { WORKER_REQUEST_RADIUS } from './workerRequestData'

export function unsafeWorkPoint(
    worker: GameCharacter,
    point: { locationId: string; position: { x: number; y: number } },
    characters: ReadonlyMap<string, GameCharacter>,
    room: GameRoom,
    now: number
): boolean {
    const navigation = room.navigationFor(point)
    return [...characters.values()].some(
        (target) =>
            target.alive &&
            target.trainingTarget === undefined &&
            !target.tags.has('offline') &&
            target.locationId === point.locationId &&
            canTargetByFaction(worker, target, now) &&
            distance(point.position, target.position) <=
                WORKER_REQUEST_RADIUS &&
            navigation.hasLineOfSight(point.position, target.position)
    )
}

export function atClerk(
    actor: GameCharacter,
    clerkId: string,
    room: GameRoom
): boolean {
    const clerk = room.getCharacter(clerkId)
    return (
        clerk?.alive === true &&
        !clerk.tags.has('state.retired') &&
        actor.locationId === clerk.locationId &&
        distance(actor.position, clerk.position) <= 64 &&
        room.navigationFor(actor).hasLineOfSight(actor.position, clerk.position)
    )
}
