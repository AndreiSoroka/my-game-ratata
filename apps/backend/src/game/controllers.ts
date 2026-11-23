import { PURSUIT_RULES, type Vector2 } from '@my-game-ratata/contracts'

import { advanceAshSkeleton } from './ashSkeletonController'
import { type GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { lastHeardPoint } from './hearing'
import { distance, normalize } from './math'
import {
    coordinatedTarget,
    isActiveObserver,
    reportedThreatPosition,
} from './mobAggro'
import { tryPursuitDash } from './mobPursuit'
import { MobSpacing } from './mobSpacing'
import type { NavigationService, TileCoordinate } from './navigation'
import { requestNpcAttack } from './npcAbilities'
import { advancePursuit, refreshPursuitObservation } from './pursuit'
import { clearPursuit, insideTerritory } from './pursuitState'
import type { GameRoom } from './room'

export interface Mob1ControllerOptions {
    fleeWhenThreatened: boolean
}

export interface CharacterController {
    readonly observesWhileCasting?: boolean
    update(character: GameCharacter, room: GameRoom, now: number): void
}

export class NetworkPlayerController implements CharacterController {
    public update(): void {
        return undefined
    }
}

export class Mob1Controller implements CharacterController {
    private readonly spacing = new MobSpacing()
    private readonly options: Mob1ControllerOptions
    private lastPlanAt = 0
    private nextWanderAt = 0
    private seed: number

    public constructor(
        seed: number,
        options: Mob1ControllerOptions = { fleeWhenThreatened: true }
    ) {
        this.options = options
        this.seed = seed
    }

    public update(character: GameCharacter, room: GameRoom, now: number): void {
        if (!canDecide(character)) {
            if (!isActiveObserver(character)) {
                clearPursuit(character)
            } else {
                refreshPursuitObservation(character, room, now)
            }
            return
        }
        if (advanceAshSkeleton(character, room, now)) {
            return
        }

        const navigation = room.navigationFor(character)
        const decision = advancePursuit(
            character,
            coordinatedTarget(character, room, now),
            room,
            now
        )
        const target = decision.target
        if (decision.returning) {
            if (target !== undefined) {
                character.clearPath()
                character.setMoveInput({ x: 0, y: 0 })
                requestNpcAttack(character, target, room, now)
            }
            return
        }
        if (
            this.spacing.update(
                character,
                room.charactersFor(character),
                navigation,
                now,
                target?.id
            )
        ) {
            return
        }
        if (target === undefined) {
            if (decision.handled) {
                return
            }
            this.investigateOrWander(character, room, navigation, now)
            return
        }
        this.engage(character, target, room, navigation, now)
    }

    private engage(
        character: GameCharacter,
        target: GameCharacter,
        room: GameRoom,
        navigation: NavigationService,
        now: number
    ): void {
        const shouldFleeTarget =
            this.options.fleeWhenThreatened && shouldFlee(character, target)

        character.updateFacing({
            x: target.position.x - character.position.x,
            y: target.position.y - character.position.y,
        })

        if (
            isTargetInAttackRange(character, target, navigation.grid.tileWidth)
        ) {
            if (!shouldFleeTarget) {
                character.clearPath()
            }
            requestNpcAttack(character, target, room, now)

            if (shouldFleeTarget) {
                this.flee(character, target, navigation, now)
            }

            return
        }

        if (shouldFleeTarget) {
            this.flee(character, target, navigation, now)
            return
        }

        this.pursue(character, target, room, navigation, now)
    }

    private investigateOrWander(
        character: GameCharacter,
        room: GameRoom,
        navigation: NavigationService,
        now: number
    ): void {
        const point =
            lastHeardPoint(character, room, now) ??
            reportedThreatPosition(character, room, now)
        if (
            point !== undefined &&
            insideTerritory(
                character,
                point,
                PURSUIT_RULES.guardianPatrolRadius
            )
        ) {
            this.investigate(character, point, navigation, now)
        } else if (!room.requestScavenge(character, now)) {
            this.wander(character, navigation, now)
        }
    }

    private investigate(
        character: GameCharacter,
        point: Vector2,
        navigation: NavigationService,
        now: number
    ): void {
        if (distance(character.position, point) <= 8) {
            character.clearPath()
            return
        }
        if (!character.hasPath() || now - this.lastPlanAt >= 500) {
            character.setPath(
                navigation.findPathWorld(character.position, point)
            )
            this.lastPlanAt = now
        }
    }

    private pursue(
        character: GameCharacter,
        target: GameCharacter,
        room: GameRoom,
        navigation: NavigationService,
        now: number
    ): void {
        const dash = this.pursuitDash(character, target, navigation, now)
        if (dash.length > 0) {
            room.publishEvents(dash)
        } else {
            this.chase(character, target, navigation, now)
        }
    }

    private pursuitDash(
        character: GameCharacter,
        target: GameCharacter,
        navigation: NavigationService,
        now: number
    ) {
        if (
            this.options.fleeWhenThreatened &&
            character.hp / character.maxHp <= 0.35
        ) {
            return []
        }
        return tryPursuitDash(character, target, navigation, now)
    }

    private chase(
        character: GameCharacter,
        target: GameCharacter,
        navigation: NavigationService,
        now: number
    ): void {
        if (character.hasPath() && now - this.lastPlanAt < 500) {
            return
        }

        character.setPath(
            navigation.findPathWorld(character.position, target.position)
        )
        this.lastPlanAt = now
    }

    private flee(
        character: GameCharacter,
        target: GameCharacter,
        navigation: NavigationService,
        now: number
    ): void {
        if (character.hasPath() && now - this.lastPlanAt < 500) {
            return
        }

        character.setPath(this.buildFleePath(character, target, navigation))
        this.lastPlanAt = now
    }

    private wander(
        character: GameCharacter,
        navigation: NavigationService,
        now: number
    ): void {
        if (character.hasPath() || now < this.nextWanderAt) {
            return
        }

        const currentTile = navigation.worldToTile(character.position)
        const target = this.pickWanderTile(character, currentTile, navigation)

        if (target !== undefined) {
            character.setPath([navigation.tileToWorld(target)])
        }

        this.nextWanderAt = now + 2000 + Math.floor(this.random() * 3000)
    }

    private buildFleePath(
        character: GameCharacter,
        target: GameCharacter,
        navigation: NavigationService
    ): Vector2[] {
        const direction = normalize({
            x: character.position.x - target.position.x,
            y: character.position.y - target.position.y,
        })
        const angles = [0, 35, -35, 70, -70, 140, -140]

        for (const angle of angles) {
            const candidate = rotate(direction, angle)
            const path = navigation.findPathWorld(character.position, {
                x: character.position.x + candidate.x * 80,
                y: character.position.y + candidate.y * 80,
            })

            if (path.length > 0) {
                return path
            }
        }

        return []
    }

    private pickWanderTile(
        character: GameCharacter,
        currentTile: TileCoordinate,
        navigation: NavigationService
    ): TileCoordinate | undefined {
        const neighbors = navigation
            .walkableNeighbors(currentTile)
            .filter((tile) =>
                insideTerritory(
                    character,
                    navigation.tileToWorld(tile),
                    PURSUIT_RULES.guardianPatrolRadius
                )
            )

        if (neighbors.length === 0) {
            return undefined
        }

        const index = Math.floor(this.random() * neighbors.length)

        return neighbors[index]
    }

    private random(): number {
        this.seed = (this.seed * 1_664_525 + 1_013_904_223) % 4_294_967_296

        return this.seed / 4_294_967_296
    }
}

function shouldFlee(character: GameCharacter, target: GameCharacter): boolean {
    return (
        (character.hp / character.maxHp <= 0.35 ||
            !character.canSpendAttackResources()) &&
        distance(character.position, target.position) < 80
    )
}

function rotate(vector: Vector2, degrees: number): Vector2 {
    const radians = (degrees * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)

    return {
        x: vector.x * cos - vector.y * sin,
        y: vector.x * sin + vector.y * cos,
    }
}

function canDecide(character: GameCharacter): boolean {
    // Simulation clears this marker after the final (possibly partial) dash step.
    // Planning before that step would leave already-passed waypoints behind the actor.
    return isActiveObserver(character) && character.movement.dashUntil === 0
}
