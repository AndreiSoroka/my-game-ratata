import type {
    AttackZone,
    CharacterAnimationAction,
    CharacterArchetype,
    CharacterControllerKind,
    CharacterFacing,
    CharacterFactionId,
    CharacterReputation,
    CharacterSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'

import { type CharacterConfig, getCharacterConfig } from './characterConfig'
import { createCharacterSnapshot } from './characterSnapshot'
import {
    type AttackResourceSpend,
    type PendingAttackHit,
    regen,
    spendResource,
} from './characterState'
import { type EquipmentState, type InventoryItemInstance } from './inventory'
import { normalize, resolveFacing, zeroVector } from './math'

interface GameCharacterOptions {
    archetype: CharacterArchetype
    controllerKind: CharacterControllerKind
    faction?: CharacterFactionId
    id: string
    nickname: string
    reputation?: CharacterReputation
    spawnPosition: Vector2
}

export class GameCharacter {
    public readonly archetype: CharacterArchetype
    public readonly config: CharacterConfig
    public readonly controllerKind: CharacterControllerKind
    public readonly faction: CharacterFactionId
    public readonly id: string
    public readonly maxHp: number
    public readonly nickname: string
    public readonly reputation: CharacterReputation
    public readonly spawnPosition: Vector2
    public animationAction: CharacterAnimationAction = 'idle'
    public animationStartedAt = Date.now()
    public animationUntil = 0
    public alive = true
    public actionLockUntil = 0
    public attackZoneUntil = 0
    public attackZones: AttackZone[] = []
    public equipment: EquipmentState = {}
    public energy: number
    public facing: CharacterFacing = 'down'
    public hp: number
    public inventory: InventoryItemInstance[] = []
    public lastAttackAt = -Infinity
    public mana: number
    public path: Vector2[] = []
    public pendingAttack: PendingAttackHit | undefined
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
        this.faction =
            options.faction ?? defaultFactionFor(options.controllerKind)
        this.energy = this.config.resources.maxEnergy
        this.hp = this.config.combat.maxHp
        this.id = options.id
        this.mana = this.config.resources.maxMana
        this.maxHp = this.config.combat.maxHp
        this.nickname = options.nickname
        this.position = { ...options.spawnPosition }
        this.reputation = {
            monsters: -100,
            ...options.reputation,
        }
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

    public remainingPath(): Vector2[] {
        return this.path.slice(this.pathIndex)
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

    public lockAction(now: number, durationMs: number): void {
        this.actionLockUntil = Math.max(this.actionLockUntil, now + durationMs)
    }

    public isActionLocked(now: number): boolean {
        return this.actionLockUntil > now
    }

    public queueAttackHit(
        now: number,
        attack: Omit<PendingAttackHit, 'hitAt'> & { windupMs: number }
    ): void {
        this.pendingAttack = {
            canStun: attack.canStun,
            damageMultiplier: attack.damageMultiplier,
            hitAt: now + attack.windupMs,
            targetEnergyDrain: attack.targetEnergyDrain,
        }
    }

    public isAttackHitDue(now: number): boolean {
        return (
            this.pendingAttack !== undefined && now >= this.pendingAttack.hitAt
        )
    }

    public consumePendingAttackHit(now: number): PendingAttackHit | undefined {
        if (!this.isAttackHitDue(now)) {
            return undefined
        }

        const attack = this.pendingAttack
        this.pendingAttack = undefined

        return attack
    }

    public clearPendingAttackHit(): void {
        this.pendingAttack = undefined
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

    public reputationWith(faction: CharacterFactionId): number {
        return this.reputation[faction] ?? 0
    }

    public spendAttackResources(): AttackResourceSpend {
        const resources = this.config.resources
        const canStun =
            resources.maxEnergy > 0 &&
            this.energy >= resources.maxEnergy &&
            this.canSpendAttackResources()
        const fullyPowered = this.canSpendAttackResources()

        this.energy = spendResource(this.energy, resources.attackEnergyCost)
        this.mana = spendResource(this.mana, resources.attackManaCost)

        return { canStun, fullyPowered }
    }

    public drainEnergy(amount: number): number {
        if (amount <= 0) {
            return 0
        }

        const before = this.energy
        this.energy = Math.max(0, this.energy - amount)

        return before - this.energy
    }

    public applyDamage(amount: number, now: number): void {
        if (!this.alive) {
            return
        }

        this.hp = Math.max(0, this.hp - amount)

        if (this.hp <= 0) {
            this.alive = false
            this.actionLockUntil = 0
            this.setAnimation('death', now)
            this.clearPath()
            this.clearPendingAttackHit()
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
        return createCharacterSnapshot(this, now)
    }

    private respawn(now: number): void {
        this.alive = true
        this.actionLockUntil = 0
        this.attackZones = []
        this.attackZoneUntil = 0
        this.animationUntil = 0
        this.clearPendingAttackHit()
        this.energy = this.config.resources.maxEnergy
        this.hp = this.maxHp
        this.mana = this.config.resources.maxMana
        this.position = { ...this.spawnPosition }
        this.respawnAt = 0
        this.stunUntil = 0
        this.velocity = zeroVector()
        this.setAnimation('idle', now)
    }
}

function defaultFactionFor(
    controllerKind: CharacterControllerKind
): CharacterFactionId {
    return controllerKind === 'network_player' ? 'peaceful' : 'monsters'
}
