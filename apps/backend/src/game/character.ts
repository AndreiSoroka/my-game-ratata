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
    type HeroClass,
    isCreatureType,
    type Vector2,
} from '@my-game-ratata/contracts'

import { createAbilityState } from './abilityState'
import type { CharacterConfig } from './characterConfig'
import { applyCharacterDamage } from './characterDamage'
import {
    defaultFactionFor,
    defaultVisualIdFor,
    type GameCharacterOptions,
} from './characterIdentity'
import {
    regenerateCharacter,
    tickCharacterTimedState,
} from './characterRecovery'
import * as characterResources from './characterResourceActions'
import { createCharacterSnapshot } from './characterSnapshot'
import { type CharacterSoul, createCharacterSoul } from './characterSoul'
import {
    type AttackResourceSpend,
    createPendingAttackHit,
    type PendingAttackHit,
} from './characterState'
import { movementInputLocked } from './combatMovement'
import { createCombatState } from './combatState'
import { initializeConstellations } from './constellations'
import { effectiveMaxHp } from './effectiveResources'
import { createCharacterConfig } from './heroClasses'
import { type EquipmentState, type InventoryItemInstance } from './inventory'
import { createMartyrState } from './martyr'
import { normalize, resolveFacing, zeroVector } from './math'
import { createMovementState } from './movementActions'
import type { NpcIdentityKey } from './npcIdentityCatalog'
import {
    bindNpcIdentityKey,
    type NpcIdentityProfile,
} from './npcIdentityProfiles'
import type { NpcSpeechProfile } from './npcSpeechProfiles'
import { PersonalConstellationSky } from './personalConstellationSky'
import type { PrayerAuraEnvironment } from './prayerAuras'
import { createResourcePractice } from './resourcePractice'
import {
    type CharacterProgression,
    createProgression,
} from './skillProgression'

export class GameCharacter {
    public readonly npcIdentityKey?: NpcIdentityKey
    public readonly npcIdentityProfile?: NpcIdentityProfile
    /** Server-owned presentation data is absent from public soul snapshots. */
    public readonly npcSpeechProfile?: NpcSpeechProfile
    public readonly trainingTarget: { areaId: string } | undefined
    /** Earned by server rules only; no client command grants this capability. */
    public exactCombatNumbers = false
    public readonly abilities: ReturnType<typeof createAbilityState>
    public readonly creatureType: CreatureType
    public readonly archetype: CharacterArchetype
    public readonly config: CharacterConfig
    public readonly controllerKind: CharacterControllerKind
    /** Socket presence is separate from participation in the world simulation. */
    public connected: boolean
    public readonly faction: CharacterFactionId
    public readonly id: string
    public baseMaxHp: number
    public readonly constellationSky = new PersonalConstellationSky(this)
    public readonly heroClass: HeroClass | undefined
    public readonly mortal: boolean
    public readonly respawnPolicy: 'automatic' | 'none'
    public readonly soul: CharacterSoul
    public progression: CharacterProgression = createProgression()
    public movement = createMovementState()
    public combat = createCombatState()
    public resourcePractice = createResourcePractice()
    public martyr = createMartyrState()
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
    public lifeStartedAt: number
    public actionLockUntil = 0
    public interruptWork: (() => void) | undefined
    public prayerAuraEnvironment: PrayerAuraEnvironment | undefined
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
        this.lifeStartedAt = options.spawnedAt ?? Date.now()
        this.trainingTarget =
            options.trainingTarget === undefined
                ? undefined
                : { ...options.trainingTarget }
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
        this.respawnPolicy = options.respawnPolicy ?? 'automatic'
        this.abilities = createAbilityState(this.heroClass, options.archetype)
        this.config = createCharacterConfig(options.archetype, this.heroClass)
        this.controllerKind = options.controllerKind
        this.connected = options.controllerKind === 'network_player'
        this.faction =
            options.faction ?? defaultFactionFor(options.controllerKind)
        this.energy = this.config.resources.maxEnergy
        this.hp = this.config.combat.maxHp
        this.id = options.id
        this.mana = this.config.resources.maxMana
        this.baseMaxHp = this.config.combat.maxHp
        this.nickname = options.nickname
        this.position = { ...options.spawnPosition }
        this.reputation = {
            monsters: -100,
            ...options.reputation,
        }
        this.spawnPosition = { ...options.spawnPosition }
        this.visualId =
            options.visualId ?? defaultVisualIdFor(options.archetype)
        bindNpcIdentityKey(this, options.npcIdentityKey)
        initializeConstellations(this)
        this.hp = this.maxHp
    }

    public get maxHp(): number {
        return effectiveMaxHp(this)
    }

    public set maxHp(base: number) {
        this.baseMaxHp = base
    }

    public setMoveInput(axis: Vector2): void {
        if (movementInputLocked(this)) {
            this.input = zeroVector()
            return
        }
        this.input = normalize(axis)

        if (this.input.x !== 0 || this.input.y !== 0) {
            this.clearPath()
        }
    }

    public getMoveInput(): Vector2 {
        return { ...this.input }
    }

    public setPath(path: Vector2[]): void {
        if (movementInputLocked(this)) {
            return
        }
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
        return point === undefined ? undefined : { ...point }
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
        this.pendingAttack = createPendingAttackHit(
            now,
            attack,
            this.equipment.weapon?.instanceId
        )
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
        tickCharacterTimedState(this, now)
    }

    public applyRegen(
        deltaMs: number,
        isMoving: boolean,
        energyAllowed = true,
        now = 0
    ) {
        return regenerateCharacter(this, deltaMs, isMoving, energyAllowed, now)
    }

    public canSpendAttackResources(): boolean {
        return characterResources.canSpendAttackResources(this)
    }

    public reputationWith(faction: CharacterFactionId): number {
        return this.reputation[faction] ?? 0
    }

    public spendAttackResources(): AttackResourceSpend {
        return characterResources.spendAttackResources(this)
    }

    public drainEnergy(amount: number): number {
        return characterResources.drainCharacterEnergy(this, amount)
    }

    public applyDamage(amount: number, now: number): void {
        applyCharacterDamage(this, amount, now)
    }

    public queueRespawn(now: number, delayMs: number): void {
        if (this.respawnAt === 0) {
            this.respawnAt = this.mortal ? this.reviveUntil : now + delayMs
        }
    }

    public snapshot(now: number, includePrivate = true) {
        return createCharacterSnapshot(this, now, includePrivate)
    }
}
