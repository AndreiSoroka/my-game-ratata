import {
    type CharacterArchetype,
    PORTAL_LIFETIME_MS,
    type Vector2,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import {
    enqueueCharacterRoute,
    hasCharacterRoute,
} from '../src/game/characterRoute'
import {
    type AttackContext,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { resolveContactBatch } from '../src/game/combatContacts'
import { grantRetaliation } from '../src/game/crimeRelations'
import { MagicCombat } from '../src/game/magicCombat'
import { bindMagicCombat, startMagicChannel } from '../src/game/magicState'
import { NavigationService } from '../src/game/navigation'
import { positionDiscontinuity } from '../src/game/positionDiscontinuity'
import { WorldLocations } from '../src/game/worldLocations'

const field = 'map-2-1'
const start = 1000

function encounter(
    options: {
        archetype?: CharacterArchetype
        origin?: Vector2
        targetPosition?: Vector2
        training?: boolean
        pvp?: boolean
    } = {}
) {
    const actor = new GameCharacter({
        id: 'zombie-attacker',
        nickname: 'Нападающий',
        archetype: options.archetype ?? 'fat_zombie',
        controllerKind: 'mob1',
        faction: options.pvp === true ? 'peaceful' : 'monsters',
        spawnPosition: options.origin ?? { x: 100, y: 100 },
        locationId: field,
    })
    const target = new GameCharacter({
        id: 'zombie-target',
        nickname: 'Цель',
        archetype: 'human',
        controllerKind: 'network_player',
        faction: 'peaceful',
        spawnPosition: options.targetPosition ?? { x: 100, y: 112 },
        locationId: field,
        ...(options.training === true
            ? { trainingTarget: { areaId: 'practice' } }
            : {}),
    })
    if (options.pvp === true) {
        grantRetaliation(actor, target, start + 10_000)
    }
    const navigation = new NavigationService({
        id: 'zombie-test',
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(1024).fill(false),
    })
    const context: AttackContext = {
        actor,
        navigation,
        targetId: target.id,
        targets: [target],
        tileSize: 16,
        now: start,
        random: () => 0.9,
        respawnDelayMsFor: () => 15_000,
    }
    function strike() {
        expect(attemptAttack(context)).toHaveLength(1)
        const pending = actor.pendingAttack
        if (pending === undefined) {
            throw new Error('Expected an ordinary melee windup')
        }
        return resolvePendingAttackHit({ ...context, now: pending.hitAt })
    }
    return { actor, target, navigation, context, strike }
}

function aim(target: GameCharacter): void {
    target.combat.readyAt = start + 3000
    target.actionLockUntil = start + 1500
    target.abilities.availableAt.shot = start + 3000
    target.queueAttackHit(start, {
        actionId: 'aiming',
        abilityId: 'shot',
        origin: 'ability',
        canStun: false,
        damageMultiplier: 1,
        targetEnergyDrain: 0,
        windupMs: 1000,
        arrow: {
            abilityId: 'shot',
            origin: { ...target.position },
            aim: { x: 0, y: -1 },
            facing: 'up',
            range: 80,
            mobile: false,
            moved: false,
            openerDamage: 0,
            previousHit: undefined,
        },
    })
}

it('pushes the victim away and interrupts the paid pending attack once', () => {
    const f = encounter()
    expect(
        enqueueCharacterRoute(
            f.target,
            { x: 160, y: 112 },
            false,
            f.navigation,
            start
        ).accepted
    ).toBe(true)
    aim(f.target)
    f.target.velocity = { x: -5, y: 0 }
    const events = f.strike()
    expect(events.find(({ kind }) => kind === 'damage')?.amount).toBe(3)
    expect(f.target.position).toEqual({ x: 100, y: 136 })
    expect(f.target.locationId).toBe(field)
    expect(f.target.velocity).toEqual({ x: 0, y: 0 })
    expect(hasCharacterRoute(f.target)).toBe(false)
    expect(f.target.remainingPath()).toEqual([])
    expect(positionDiscontinuity(f.target)).toBe(1)
    expect(f.target.pendingAttack).toBeUndefined()
    expect(f.target.combat.readyAt).toBe(start + 3000)
    expect(f.target.actionLockUntil).toBe(start + 1500)
    expect(f.target.abilities.availableAt.shot).toBe(start + 3000)
    expect(events.filter(({ phase }) => phase === 'interrupted')).toEqual([
        expect.objectContaining({ actorId: f.target.id, actionId: 'aiming' }),
    ])
    expect(
        resolvePendingAttackHit({ ...f.context, now: start + 1000 })
    ).toEqual([])
})

it('gives the unlocked push branch its authored additional range', () => {
    const f = encounter()
    for (const rank of [2, 4, 6]) {
        f.actor.progression.constellations.opened.add(
            `fat_zombie.push${String(rank)}`
        )
    }
    f.strike()
    expect(f.target.position).toEqual({ x: 100, y: 144 })
})

it('applies ordinary hit damage at a wall without displacing or canceling aim', () => {
    const f = encounter({
        origin: { x: 100, y: 115.5 },
        targetPosition: { x: 100, y: 127.5 },
    })
    f.navigation.grid.solid[8 * 32 + 6] = true
    aim(f.target)
    const events = f.strike()
    expect(events.some(({ kind }) => kind === 'damage')).toBe(true)
    expect(f.target.position).toEqual({ x: 100, y: 127.5 })
    expect(positionDiscontinuity(f.target)).toBeUndefined()
    expect(f.target.pendingAttack?.actionId).toBe('aiming')
})

it('does not cut diagonally between the two solid cells of a corner', () => {
    const f = encounter({ targetPosition: { x: 111, y: 111 } })
    f.navigation.grid.solid[6 * 32 + 7] = true
    f.navigation.grid.solid[7 * 32 + 6] = true
    expect(f.strike().some(({ kind }) => kind === 'damage')).toBe(true)
    expect(f.target.position).toEqual({ x: 111, y: 111 })
    expect(positionDiscontinuity(f.target)).toBeUndefined()
})

it('stops at the entry perimeter of a stair on the same floor', () => {
    const f = encounter()
    f.navigation.grid.dungeonPassages = [
        {
            id: 'test-stair',
            destinationLocationId: 'test-floor',
            destinationPassageId: 'next-stair',
            direction: 'down',
            position: { x: 100, y: 132 },
            arrival: { x: 100, y: 148 },
            triggerRadius: 7,
        },
    ]
    f.strike()
    expect(f.target.position.y).toBeCloseTo(125)
    expect(f.target.position.y).toBeLessThan(125)
    expect(f.target.locationId).toBe(field)
})

it.each([false, true])(
    'respects the active portal zone, expiration=%s',
    (expired) => {
        const f = encounter()
        const caster = new GameCharacter({
            id: 'portal-caster',
            nickname: 'Маг',
            archetype: 'human',
            controllerKind: 'network_player',
            spawnPosition: { x: 100, y: 150 },
            locationId: field,
        })
        const { portals } = new WorldLocations(f.navigation)
        const openedAt = expired ? start - PORTAL_LIFETIME_MS + 1 : start
        expect(portals.open(caster, openedAt)).toBeDefined()
        f.context.portals = portals
        f.strike()
        expect(f.target.position.y).toBeCloseTo(expired ? 136 : 118)
        if (!expired) {
            expect(f.target.position.y).toBeLessThan(118)
        }
        expect(f.target.locationId).toBe(field)
    }
)

it.each([false, true])(
    'respects a Chains field, already rooted=%s',
    (rooted) => {
        const f = encounter()
        const caster = new GameCharacter({
            id: 'chain-caster',
            nickname: 'Маг',
            archetype: 'human',
            controllerKind: 'network_player',
            spawnPosition: { x: 100, y: rooted ? 150 : 160 },
            locationId: field,
        })
        bindMagicCombat(new MagicCombat(), [f.actor, f.target, caster])
        startMagicChannel(caster, {
            abilityId: 'chains',
            locationId: field,
            startedAt: start,
            completesAt: start + 3000,
            center: { ...caster.position },
            radius: 40,
            manaPerSecond: 0,
            chargedThrough: start,
            practiced: false,
            partyImmune: false,
            navigation: f.navigation,
        })
        f.strike()
        expect(f.target.position.y).toBe(rooted ? 112 : 120)
        expect(caster.progression.masteries.magic.experience).toBe(0n)
    }
)

it('pushes after ordinary defended damage against a personal enemy', () => {
    const f = encounter({ pvp: true })
    f.strike()
    expect(f.target.position).toEqual({ x: 100, y: 136 })
})

it.each([
    'lethal',
    'absorbed',
    'dodged',
    'training',
    'normal skeleton',
] as const)('leaves the target in place for %s contact', (scenario) => {
    const f = encounter({
        archetype: scenario === 'normal skeleton' ? 'skeleton' : 'fat_zombie',
        training: scenario === 'training',
    })
    if (scenario === 'lethal') {
        f.target.hp = 1
    } else if (scenario === 'absorbed') {
        f.target.abilities.barrier = {
            expiresAt: start + 1000,
            practiced: false,
        }
    } else if (scenario === 'dodged') {
        f.target.config.combat.dodgeChance = 0.5
        f.context.random = () => 0.2
    }
    const events = f.strike()
    expect(
        events.some(
            ({ kind }) =>
                kind ===
                (scenario === 'absorbed'
                    ? 'absorb'
                    : scenario === 'dodged'
                      ? 'miss'
                      : 'damage')
        )
    ).toBe(true)
    expect(f.target.position).toEqual({ x: 100, y: 112 })
    expect(positionDiscontinuity(f.target)).toBeUndefined()
})

it('does not add displacement to a nonordinary melee attack', () => {
    const f = encounter()
    const events = resolveContactBatch(
        f.context,
        {
            origin: 'counter',
            delivery: 'melee_physical',
            canStun: false,
            damageMultiplier: 1,
            hitAt: start,
            targetEnergyDrain: 0,
        },
        [f.target]
    )
    expect(events.some(({ kind }) => kind === 'damage')).toBe(true)
    expect(f.target.position).toEqual({ x: 100, y: 112 })
})
