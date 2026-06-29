import type {
    AttackZone,
    CharacterAnimationAction,
    CharacterArchetype,
    CharacterControllerKind,
    CharacterFacing,
    CharacterSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'

import { type CharacterConfig, getCharacterConfig } from './characterConfig'
import { normalize, resolveFacing, zeroVector } from './math'

interface GameCharacterOptions {
    archetype: CharacterArchetype
    controllerKind: CharacterControllerKind
    id: string
    nickname: string
    spawnPosition: Vector2
}

export class GameCharacter {
    public readonly archetype: CharacterArchetype
    public readonly config: CharacterConfig
    public readonly controllerKind: CharacterControllerKind
    public readonly id: string
    public readonly maxHp: number
    public readonly nickname: string
    public readonly spawnPosition: Vector2
    public animationAction: CharacterAnimationAction = 'idle'
    public animationStartedAt = Date.now()
    public animationUntil = 0
    public alive = true
    public attackZoneUntil = 0
    public attackZones: AttackZone[] = []
    public energy: number
    public facing: CharacterFacing = 'down'
    public hp: number
    public lastAttackAt = -Infinity
    public mana: number
    public path: Vector2[] = []
    public position: Vector2
    public respawnAt = 0
    public stunUntil = 0
    public tags = new Set<string>()
    public velocity: Vector2 = zeroVector()
    private input: Vector2 = zeroVector()
    private pathIndex = 0

    public constructor(options: GameCharacterOptions) {
        this.archetype = options.archetype
        this.config = getCharacterConfig(options.archetype)
        this.controllerKind = options.controllerKind
        this.energy = this.config.resources.maxEnergy
        this.hp = this.config.combat.maxHp
        this.id = options.id
        this.mana = this.config.resources.maxMana
        this.maxHp = this.config.combat.maxHp
        this.nickname = options.nickname
        this.position = { ...options.spawnPosition }
        this.spawnPosition = { ...options.spawnPosition }
    }

    public setMoveInput(axis: Vector2): void {
        this.input = normalize(axis)

        if (this.input.x !== 0 || this.input.y !== 0) {
            this.clearPath()
        }
    }

    public getMoveInput(): Vector2 {
        return { ...this.input }
    }

    public setPath(path: Vector2[]): void {
        this.path = path
        this.pathIndex = 0
        this.input = zeroVector()
    }

    public clearPath(): void {
        this.path = []
        this.pathIndex = 0
    }

    public hasPath(): boolean {
        return this.pathIndex < this.path.length
    }

    public nextPathPoint(): Vector2 | undefined {
        const point = this.path[this.pathIndex]

        if (point === undefined) {
            return undefined
        }

        return { ...point }
    }

    public completePathPoint(): void {
        this.pathIndex += 1

        if (!this.hasPath()) {
            this.clearPath()
        }
    }

    public updateFacing(vector: Vector2): void {
        this.facing = resolveFacing(vector, this.facing)
    }

    public setAnimation(
        action: CharacterAnimationAction,
        now: number,
        lockMs = 0
    ): void {
        if (this.animationAction !== action || lockMs > 0) {
            this.animationAction = action
            this.animationStartedAt = now
        }

        this.animationUntil = Math.max(this.animationUntil, now + lockMs)
    }

    public updateMovementAnimation(isMoving: boolean, now: number): void {
        if (!this.alive || now < this.animationUntil) {
            return
        }

        this.setAnimation(isMoving ? 'walk' : 'idle', now)
    }

    public tickTimedState(now: number): void {
        if (this.attackZoneUntil > 0 && now >= this.attackZoneUntil) {
            this.attackZones = []
            this.attackZoneUntil = 0
        }

        if (!this.alive && this.respawnAt > 0 && now >= this.respawnAt) {
            this.respawn(now)
        }
    }

    public applyRegen(deltaMs: number, isMoving: boolean): void {
        if (!this.alive) {
            return
        }

        const resources = this.config.resources
        const energyRegen = isMoving
            ? resources.energyRegenMove
            : resources.energyRegenIdle
        const manaRegen = isMoving
            ? resources.manaRegenMove
            : resources.manaRegenIdle

        this.energy = regen(
            this.energy,
            resources.maxEnergy,
            energyRegen,
            deltaMs
        )
        this.mana = regen(this.mana, resources.maxMana, manaRegen, deltaMs)
        this.hp = regen(
            this.hp,
            this.maxHp,
            isMoving
                ? this.config.hpRegenMovePerSec
                : this.config.hpRegenIdlePerSec,
            deltaMs
        )
    }

    public canSpendAttackResources(): boolean {
        const resources = this.config.resources

        return (
            this.energy >= resources.attackEnergyCost &&
            this.mana >= resources.attackManaCost
        )
    }

    public spendAttackResources(): void {
        const resources = this.config.resources
        this.energy = Math.max(0, this.energy - resources.attackEnergyCost)
        this.mana = Math.max(0, this.mana - resources.attackManaCost)
    }

    public applyDamage(amount: number, now: number): void {
        if (!this.alive) {
            return
        }

        this.hp = Math.max(0, this.hp - amount)

        if (this.hp <= 0) {
            this.alive = false
            this.setAnimation('death', now)
            this.clearPath()
            this.setMoveInput(zeroVector())
            this.velocity = zeroVector()
            return
        }

        this.setAnimation('damaged', now, 300)
    }

    public queueRespawn(now: number, delayMs: number): void {
        if (this.respawnAt === 0) {
            this.respawnAt = now + delayMs
        }
    }

    public snapshot(now: number): CharacterSnapshot {
        return {
            alive: this.alive,
            animation: {
                action: this.animationAction,
                startedAt: this.animationStartedAt,
            },
            archetype: this.archetype,
            attackZones: this.attackZones,
            controllerKind: this.controllerKind,
            cooldowns: {
                attackMsLeft: Math.max(
                    0,
                    this.config.combat.attackCooldownMs -
                        (now - this.lastAttackAt)
                ),
                respawnMsLeft: this.alive
                    ? 0
                    : Math.max(0, this.respawnAt - now),
                stunMsLeft: Math.max(0, this.stunUntil - now),
            },
            facing: this.facing,
            hp: Math.round(this.hp),
            id: this.id,
            maxHp: this.maxHp,
            nickname: this.nickname,
            path: this.path.slice(this.pathIndex),
            position: this.position,
            resources: {
                energy: Math.round(this.energy),
                mana: Math.round(this.mana),
                maxEnergy: this.config.resources.maxEnergy,
                maxMana: this.config.resources.maxMana,
            },
            tags: this.snapshotTags(now),
            velocity: this.velocity,
        }
    }

    private respawn(now: number): void {
        this.alive = true
        this.attackZones = []
        this.attackZoneUntil = 0
        this.animationUntil = 0
        this.energy = this.config.resources.maxEnergy
        this.hp = this.maxHp
        this.mana = this.config.resources.maxMana
        this.position = { ...this.spawnPosition }
        this.respawnAt = 0
        this.stunUntil = 0
        this.velocity = zeroVector()
        this.setAnimation('idle', now)
    }

    private snapshotTags(now: number): string[] {
        const tags = [...this.tags]

        if (!this.alive) {
            tags.push('state.dead')
        }

        if (this.stunUntil > now) {
            tags.push('state.cc.stunned')
        }

        return tags
    }
}

function regen(
    current: number,
    max: number,
    perSecond: number,
    deltaMs: number
): number {
    if (max <= 0 || perSecond <= 0) {
        return Math.max(0, Math.min(current, max))
    }

    return Math.max(0, Math.min(max, current + perSecond * (deltaMs / 1000)))
}
