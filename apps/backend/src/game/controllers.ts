import type { Vector2 } from '@my-game-ratata/contracts'

import { type GameCharacter } from './character'
import { distance, normalize } from './math'
import type { NavigationService, TileCoordinate } from './navigation'
import type { GameRoom } from './room'

export interface Mob1ControllerOptions {
    fleeWhenThreatened: boolean
}

export interface CharacterController {
    update(character: GameCharacter, room: GameRoom, now: number): void
}

export class NetworkPlayerController implements CharacterController {
    public update(): void {
        return undefined
    }
}

export class Mob1Controller implements CharacterController {
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
        if (!character.alive) {
            return
        }

        const target = room.findVisibleTarget(character, 112)
        const shouldFleeTarget =
            target !== undefined &&
            this.options.fleeWhenThreatened &&
            shouldFlee(character, target)

        if (target !== undefined && isInMeleeRange(character, target)) {
            if (!shouldFleeTarget) {
                character.clearPath()
            }
            character.updateFacing({
                x: target.position.x - character.position.x,
                y: target.position.y - character.position.y,
            })
            room.requestAttack(character, now)

            if (shouldFleeTarget) {
                this.flee(character, target, room.navigation, now)
            }

            return
        }

        if (target !== undefined && shouldFleeTarget) {
            this.flee(character, target, room.navigation, now)
            return
        }

        if (target !== undefined) {
            this.chase(character, target, room.navigation, now)
            return
        }

        this.wander(character, room.navigation, now)
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
        const target = this.pickWanderTile(currentTile, navigation)

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
        currentTile: TileCoordinate,
        navigation: NavigationService
    ): TileCoordinate | undefined {
        const neighbors = navigation.walkableNeighbors(currentTile)

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

function isInMeleeRange(
    character: GameCharacter,
    target: GameCharacter
): boolean {
    return distance(character.position, target.position) <= 24
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
