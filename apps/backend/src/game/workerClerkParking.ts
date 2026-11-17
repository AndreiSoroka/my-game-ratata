import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'
import type { GameRoom } from './room'
import { approach, stop } from './workerNavigation'
import type { WorkerRequestService } from './workerRequests'
import { atClerk } from './workerRequestSafety'

interface ParkingRecord {
    actor: GameCharacter
    clerkId: string
    locationId: string
    point?: Vector2
    nextPlanAt: number
    nextRouteAt: number
}
type ParkingOutcome = 'arrived' | 'moving' | 'blocked'
const services = new WeakMap<WorkerRequestService, WorkerClerkParking>()
const planDelay = 1000

export function parkWorkerAtClerk(
    actor: GameCharacter,
    clerk: GameCharacter,
    room: GameRoom,
    now: number
): ParkingOutcome {
    let parking = services.get(room.workerRequests)
    if (parking === undefined) {
        parking = new WorkerClerkParking(room.workerRequests)
        services.set(room.workerRequests, parking)
    }
    return parking.advance(actor, clerk, room, now)
}

/** Stable waiting places use ordinary collision, navigation, reach and sight. */
export class WorkerClerkParking {
    private readonly records = new Map<string, ParkingRecord>()
    public constructor(
        private readonly requests: Pick<WorkerRequestService, 'forWorker'>
    ) {}

    public advance(
        actor: GameCharacter,
        clerk: GameCharacter,
        room: GameRoom,
        now: number
    ): ParkingOutcome {
        this.clean()
        const record = this.records.get(actor.id) ?? {
            actor,
            clerkId: clerk.id,
            locationId: clerk.locationId,
            nextPlanAt: 0,
            nextRouteAt: 0,
        }
        this.records.set(actor.id, record)
        const navigation = room.navigationFor(clerk)
        if (!this.prepare(record, clerk, room, now)) {
            stop(actor)
            return 'blocked'
        }
        const point = record.point
        if (point === undefined) {
            stop(actor)
            return 'blocked'
        }
        if (
            actor.locationId === clerk.locationId &&
            distance(actor.position, point) <= 8 &&
            navigation.hasLineOfSight(actor.position, clerk.position)
        ) {
            stop(actor)
            return atClerk(actor, clerk.id, room) ? 'arrived' : 'blocked'
        }
        if (now >= record.nextRouteAt) {
            record.nextRouteAt = now + planDelay
            approach(actor, room, clerk.locationId, point, 8)
            if (
                !actor.hasPath() &&
                actor.getMoveInput().x === 0 &&
                actor.getMoveInput().y === 0
            ) {
                delete record.point
                record.nextPlanAt = now + planDelay
                return 'blocked'
            }
        }
        return 'moving'
    }

    private prepare(
        record: ParkingRecord,
        clerk: GameCharacter,
        room: GameRoom,
        now: number
    ): boolean {
        if (
            record.clerkId === clerk.id &&
            record.locationId === clerk.locationId &&
            this.validPoint(record.point, clerk, room.navigationFor(clerk))
        ) {
            return true
        }
        if (now < record.nextPlanAt) {
            return false
        }
        record.nextPlanAt = now + planDelay
        record.clerkId = clerk.id
        record.locationId = clerk.locationId
        const point = this.selectPoint(record, clerk, room)
        if (point === undefined) {
            delete record.point
            return false
        }
        record.point = point
        record.nextRouteAt = now
        return true
    }

    private selectPoint(
        record: ParkingRecord,
        clerk: GameCharacter,
        room: GameRoom
    ): Vector2 | undefined {
        const navigation = room.navigationFor(clerk)
        return parkingCandidates(clerk.position, navigation).find(
            (point) =>
                this.validPoint(point, clerk, navigation) &&
                this.free(point, record) &&
                this.reachable(point, record.actor, clerk, room)
        )
    }

    private validPoint(
        point: Vector2 | undefined,
        clerk: GameCharacter,
        navigation: NavigationService
    ): point is Vector2 {
        return (
            point !== undefined &&
            distance(point, clerk.position) <= 56 &&
            distance(point, clerk.position) >= 24 &&
            !navigation.isSolidTile(navigation.worldToTile(point)) &&
            navigation.hasLineOfSight(point, clerk.position)
        )
    }

    private free(point: Vector2, own: ParkingRecord): boolean {
        return [...this.records.values()].every(
            (record) =>
                record === own ||
                record.clerkId !== own.clerkId ||
                record.locationId !== own.locationId ||
                record.point === undefined ||
                distance(point, record.point) >= 24
        )
    }

    private reachable(
        point: Vector2,
        actor: GameCharacter,
        clerk: GameCharacter,
        room: GameRoom
    ): boolean {
        const from =
            actor.locationId === clerk.locationId
                ? actor.position
                : clerk.position
        return room.navigationFor(clerk).findPathWorld(from, point).length > 0
    }

    private clean(): void {
        for (const [id, record] of this.records) {
            const request = this.requests.forWorker(id)
            if (
                !record.actor.alive ||
                request === null ||
                !['reporting', 'waiting', 'returning', 'ready'].includes(
                    request.stage
                )
            ) {
                this.records.delete(id)
            }
        }
    }
}

function parkingCandidates(
    center: Vector2,
    navigation: NavigationService
): Vector2[] {
    const directions = [
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: -1, y: 0 },
        { x: 0.707, y: 0.707 },
        { x: -0.707, y: 0.707 },
        { x: 0.707, y: -0.707 },
        { x: -0.707, y: -0.707 },
    ]
    return [40, 32, 48].flatMap((radius) =>
        directions.map((direction) =>
            navigation.tileToWorld(
                navigation.worldToTile({
                    x: center.x + radius * direction.x,
                    y: center.y + radius * direction.y,
                })
            )
        )
    )
}
