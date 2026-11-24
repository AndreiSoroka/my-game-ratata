import {
    ABILITY_DEFINITIONS,
    ASH_RITE_RULES,
    type Vector2,
    WORLD_DIRECTIONS,
    type WorldDirection,
    worldLocationNeighbor,
} from '@my-game-ratata/contracts'

import { advanceAshRegionalTravel } from './ashRegionalTravel'
import {
    ashBoundSkeletons,
    ashSkeletonGuard,
    guardAshSkeleton,
} from './ashSkeletonState'
import { canTameAshSkeleton, isTameableAshSkeleton } from './ashTaming'
import type { GameCharacter } from './character'
import { distance } from './math'
import { moveNecromancer, performNecromancerTactic } from './necromancerActions'
import type { NecromancerRefuge, NecromancerScene } from './necromancerTactics'
import type { GameRoom } from './room'

const searchDelayMs = 30_000
const searchWindowMs = 45_000

interface SearchTrip {
    destination: string
    phase: 'outbound' | 'searching' | 'returning'
    expiresAt: number
    initialCount: number
}

export class NecromancerRetinue {
    private nextSearchAt = -Infinity
    private searchUntil = -Infinity
    private nextRegion = 0
    private trip: SearchTrip | undefined
    private readonly visited = new Set<string>()

    public constructor(private readonly refuge: NecromancerRefuge) {}

    public replenish(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        now: number
    ): boolean {
        const count = ashBoundSkeletons(actor).length
        if (this.trip !== undefined) {
            return this.advanceTrip(actor, room, scene, count, now)
        }
        if (count >= ASH_RITE_RULES.orderSlots) {
            this.searchUntil = -Infinity
            this.visited.clear()
            return false
        }
        if (!actor.abilities.known.has('ash_tame') || now < this.nextSearchAt) {
            return false
        }
        const navigation = room.navigationFor(actor)
        if (actor.locationId !== actor.spawnLocationId) {
            return advanceAshRegionalTravel(
                actor,
                actor.spawnLocationId,
                navigation,
                now
            )
        }
        if (this.searchUntil === -Infinity) {
            this.searchUntil = now + searchWindowMs
        }
        if (
            now < this.searchUntil &&
            this.inspectCurrentMap(actor, room, scene, now)
        ) {
            return true
        }
        this.searchUntil = now
        if (!this.ensureChestGuard(actor, room, now)) {
            return true
        }
        const graves = room.abilityContextFor(actor, now).graves
        const destinations = (Object.keys(WORLD_DIRECTIONS) as WorldDirection[])
            .map((direction) =>
                worldLocationNeighbor(actor.spawnLocationId, direction)
            )
            .filter(
                (location) =>
                    location !== undefined &&
                    location.biome !== 'city' &&
                    graves
                        ?.list(location.id)
                        .some(({ id }) => !id.startsWith('final:')) === true
            )
        const next = destinations[this.nextRegion % destinations.length]
        this.nextRegion += 1
        this.searchUntil = -Infinity
        this.visited.clear()
        if (next === undefined) {
            this.nextSearchAt = now + searchDelayMs
            return false
        }
        this.trip = {
            destination: next.id,
            phase: 'outbound',
            expiresAt: now + searchWindowMs,
            initialCount: count,
        }
        return this.advanceTrip(actor, room, scene, count, now)
    }

    private advanceTrip(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        count: number,
        now: number
    ): boolean {
        const trip = this.trip
        if (trip === undefined) {
            return false
        }
        const navigation = room.navigationFor(actor)
        if (
            trip.phase === 'outbound' &&
            actor.locationId === trip.destination
        ) {
            trip.phase = 'searching'
            trip.expiresAt = now + searchWindowMs
        }
        if (now >= trip.expiresAt || count > trip.initialCount) {
            trip.phase = 'returning'
        }
        if (trip.phase === 'outbound') {
            if (
                advanceAshRegionalTravel(
                    actor,
                    trip.destination,
                    navigation,
                    now
                )
            ) {
                return true
            }
            trip.phase = 'returning'
        }
        if (trip.phase === 'searching') {
            if (this.inspectCurrentMap(actor, room, scene, now)) {
                return true
            }
            trip.phase = 'returning'
        }
        if (actor.locationId !== actor.spawnLocationId) {
            advanceAshRegionalTravel(
                actor,
                actor.spawnLocationId,
                navigation,
                now
            )
            return true
        }
        if (moveNecromancer(actor, room, this.refuge.home, false, now)) {
            return true
        }
        this.trip = undefined
        this.nextSearchAt = now + searchDelayMs
        this.visited.clear()
        return false
    }

    private ensureChestGuard(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): boolean {
        const navigation = room.navigationFor(actor)
        const current = ashBoundSkeletons(actor)
        const point = this.refuge.home
        if (current.length === 0) {
            return !moveNecromancer(actor, room, point, false, now)
        }
        const guard =
            current.find(
                (skeleton) => ashSkeletonGuard(skeleton) !== undefined
            ) ?? current[0]
        if (guard === undefined) {
            return false
        }
        const post = ashSkeletonGuard(guard)
        const stationed =
            post?.locationId === actor.locationId &&
            distance(post.position, point) <= navigation.grid.tileWidth * 3
        if (!stationed) {
            guardAshSkeleton(guard, {
                locationId: actor.locationId,
                position: point,
            })
        }
        return (
            guard.locationId === actor.locationId &&
            distance(guard.position, point) <= navigation.grid.tileWidth * 3
        )
    }

    private inspectCurrentMap(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        now: number
    ): boolean {
        const context = room.abilityContextFor(actor, now)
        for (const skeleton of scene.visible) {
            if (!isTameableAshSkeleton(actor, skeleton)) {
                continue
            }
            if (
                canTameAshSkeleton(actor, skeleton, context) &&
                performNecromancerTactic(
                    actor,
                    room,
                    { tactic: 'tame', targetId: skeleton.id },
                    now
                )
            ) {
                return true
            }
            if (
                distance(actor.position, skeleton.position) <=
                    ABILITY_DEFINITIONS.ash_tame.range ||
                moveNecromancer(actor, room, skeleton.position, false, now)
            ) {
                return true
            }
        }
        return this.inspectLocalGraves(actor, room, now)
    }

    private inspectLocalGraves(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): boolean {
        const navigation = room.navigationFor(actor)
        const graves = navigation.grid.encounters?.graves ?? []
        for (const grave of graves) {
            if (
                grave.locationId !== actor.locationId ||
                this.visited.has(grave.id)
            ) {
                continue
            }
            const point = navigation.findWalkableTileNear(
                navigation.worldToTile(grave.position)
            )
            if (point !== undefined) {
                const destination: Vector2 = navigation.tileToWorld(point)
                if (
                    distance(actor.position, destination) >
                        navigation.grid.tileWidth &&
                    moveNecromancer(actor, room, destination, false, now)
                ) {
                    return true
                }
            }
            this.visited.add(grave.id)
        }
        return false
    }
}
