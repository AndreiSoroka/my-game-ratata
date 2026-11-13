import {
    archetypeCreatureTypes,
    type AttackZone,
    CENTER_LOCATION_ID,
    type CharacterAnimationAction,
    type CharacterArchetype,
    type CharacterControllerKind,
    type CharacterFacing,
    type CharacterFactionId,
    type CharacterReputation,
    type CharacterVisualId,
    type CreatureType,
    HERO_REVIVAL_WINDOW_MS,
    type HeroClass,
    isCreatureType,
    type SoulSnapshot,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { CharacterConfig } from './characterConfig'
import {
    defaultFactionFor,
    defaultVisualIdFor,
    type GameCharacterOptions,
} from './characterIdentity'
import { regenerateCharacter, restoreCharacter } from './characterRecovery'
import { createCharacterSnapshot } from './characterSnapshot'
import { createCharacterSoul } from './characterSoul'
import {
    type AttackResourceSpend,
    type PendingAttackHit,
    spendResource,
} from './characterState'
import { createCharacterConfig } from './heroClasses'
import { type EquipmentState, type InventoryItemInstance } from './inventory'
import { normalize, resolveFacing, zeroVector } from './math'
import { createMovementState } from './movementActions'
import {
    type CharacterProgression,
    createProgression,
} from './skillProgression'

export class GameCharacter {
    public readonly creatureType: CreatureType
    public readonly archetype: CharacterArchetype
    public readonly config: CharacterConfig
    public readonly controllerKind: CharacterControllerKind
    public readonly faction: CharacterFactionId
    public readonly id: string
    public maxHp: number
    public readonly heroClass: HeroClass | undefined
    public readonly mortal: boolean
    public readonly soul: SoulSnapshot
    public progression: CharacterProgression = createProgression()
    public movement = createMovementState()
    public level = 1
    public xp = 0
    public reviveUntil = 0
    public readonly spawnLocationId: string
    public locationId: string
    public readonly nickname: string
    public readonly reputation: CharacterReputation
    public readonly spawnPosition: Vector2
    public readonly visualId: CharacterVisualId
    public animationAction: CharacterAnimationAction = 'idle'
    public animationStartedAt = Date.now()
    public animationUntil = 0
    public alive = true
    public deathSequence = 0
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
        const creatureType =
            options.creatureType ?? archetypeCreatureTypes[options.archetype]
        if (!isCreatureType(creatureType)) {
            throw new Error('Unknown creature type')
        }
        this.creatureType = creatureType
        this.soul = createCharacterSoul(options)
        this.locationId = options.locationId ?? CENTER_LOCATION_ID
        this.spawnLocationId = this.locationId
        this.archetype = options.archetype
        this.heroClass =
            options.heroClass ??
            (options.archetype === 'human' ? 'vanguard' : undefined)
        this.mortal =
            options.mortal ?? options.controllerKind === 'network_player'
        this.config = createCharacterConfig(options.archetype, this.heroClass)
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
        this.visualId =
            options.visualId ?? defaultVisualIdFor(options.archetype)
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

        if (
            !this.mortal &&
            !this.alive &&
            this.respawnAt > 0 &&
            now >= this.respawnAt
        ) {
            restoreCharacter(this, now, true)
        }
    }

    public applyRegen(
        deltaMs: number,
        isMoving: boolean,
        energyAllowed = true
    ): void {
        regenerateCharacter(this, deltaMs, isMoving, energyAllowed)
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
            this.deathSequence += 1
            this.alive = false
            this.reviveUntil = now + HERO_REVIVAL_WINDOW_MS
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
            this.respawnAt = this.mortal ? this.reviveUntil : now + delayMs
        }
    }

    public snapshot(now: number) {
        return createCharacterSnapshot(this, now)
    }
}
