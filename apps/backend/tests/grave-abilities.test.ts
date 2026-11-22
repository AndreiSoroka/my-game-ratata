import { expect, it, vi } from 'vitest'

import {
    advanceCharacterControl,
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import {
    attemptAbilityAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { createItemInstance } from '../src/game/inventory'
import { magicAttackWindingUp } from '../src/game/magicState'
import { advanceCharacter } from '../src/game/movement'
import { castSpell } from '../src/game/spellCasting'
import { graveCombatFixture } from './graveCombatFixture'

it.each(['targeted', 'forward'] as const)(
    'hits stone with a %s Shot for fractional projectile damage without sword wear or practice',
    (mode) => {
        const f = graveCombatFixture()
        const sword = createItemInstance('simple_sword')
        f.actor.equipment.weapon = sword
        const masteries = structuredClone(f.actor.progression.masteries)
        const start = f.ability(
            'shot',
            1000,
            mode === 'targeted' ? f.reference : null
        )
        expect(start[0]?.kind).toBe('attack')
        const hit = f.hit()
        expect(hit[0]).toMatchObject({
            kind: 'world_damage',
            target: f.reference,
            abilityId: 'shot',
            amount: 0.3,
        })
        expect(f.actor.energy).toBe(110)
        expect(sword.durability).toBe(200)
        expect(f.actor.progression.masteries).toEqual(masteries)
        expect(f.service.get('grave')?.hp).toBe(99.7)
    }
)
it.each([106, 120])(
    'a forward arrow hits exactly the nearest target when enemy at%d',
    (enemyX) => {
        const f = graveCombatFixture()
        const enemy = f.enemy(enemyX)
        attemptAbilityAttack({ ...f.attack(), target: undefined }, 'shot')
        const events = f.hit()
        expect(
            events.filter(
                (event) =>
                    event.kind === 'damage' || event.kind === 'world_damage'
            )
        ).toHaveLength(1)
        if (enemyX < 112) {
            expect(enemy.hp).toBeLessThan(enemy.maxHp)
            expect(f.service.get('grave')?.hp).toBe(100)
        } else {
            expect(enemy.hp).toBe(enemy.maxHp)
            expect(f.service.get('grave')?.hp).toBe(99.7)
        }
    }
)
it.each(['behind', 'wall', 'width', 'range'] as const)(
    'a forward arrow misses stone outside its legal %s',
    (reason) => {
        const f = graveCombatFixture()
        if (reason === 'behind') {
            f.actor.facing = 'left'
        }
        if (reason === 'wall') {
            vi.spyOn(f.context.navigation, 'hasLineOfSight').mockReturnValue(
                false
            )
        }
        if (reason === 'width') {
            f.actor.position.y = 112
        }
        if (reason === 'range') {
            f.actor.position.x = 47
        }
        const masteries = structuredClone(f.actor.progression.masteries)
        expect(
            attemptAbilityAttack(
                { ...f.attack(), target: undefined },
                'shot'
            )[0]?.kind
        ).toBe('attack')
        expect(f.hit()).toEqual([
            expect.objectContaining({
                kind: 'miss',
                hitQuality: 'miss',
                abilityId: 'shot',
            }),
        ])
        expect(f.service.get('grave')?.hp).toBe(100)
        expect(f.actor.progression.masteries).toEqual(masteries)
    }
)
it('uses arcane stone resistance and normal costs for Spark after its own windup', () => {
    const f = graveCombatFixture('arcanist')
    const masteries = structuredClone(f.actor.progression.masteries)
    expect(f.ability('spark')[0]).toMatchObject({
        kind: 'attack',
        abilityId: 'spark',
        target: f.reference,
    })
    expect(f.hit(1199)).toEqual([])
    expect(f.hit(1200)[0]).toMatchObject({
        kind: 'world_damage',
        amount: 1.25,
        damageKind: 'arcane',
    })
    expect(f.actor.mana).toBe(64)
    expect(f.actor.energy).toBe(95)
    expect(f.actor.progression.masteries).toEqual(masteries)
})
it.each(['fireball', 'greater_fireball'] as const)(
    'resolves %s on the pinned grave after the windup and flight, with no practice',
    (id) => {
        const f = graveCombatFixture('arcanist')
        f.actor.position.x = 20
        f.actor.abilities.known.add(id)
        const masteries = structuredClone(f.actor.progression.masteries)
        expect(f.ability(id)[0]).toMatchObject({
            kind: 'attack',
            abilityId: id,
            target: f.reference,
        })
        expect(f.service.get('grave')?.hp).toBe(100)
        expect(f.hit(1687)).toEqual([])
        expect(f.hit(1688)[0]).toMatchObject({
            kind: 'world_damage',
            amount: id === 'fireball' ? 6.25 : 21.25,
            damageKind: 'arcane',
        })
        expect(f.actor.mana).toBe(id === 'fireball' ? 55 : 30)
        expect(f.actor.progression.masteries).toEqual(masteries)
        expect(f.hit(1700)).toEqual([])
    }
)
it.each([
    'locked',
    'mana',
    'cooldown',
    'range',
    'wall',
    'cross-location',
    'purified',
    'missing',
    'dual-target',
] as const)('rejects %s grave spells atomically', (reason) => {
    const f = graveCombatFixture('arcanist')
    const target = { ...f.reference }
    if (reason !== 'locked') {
        f.actor.abilities.known.add('fireball')
    }
    if (reason === 'mana') {
        f.actor.mana = 0
    }
    if (reason === 'cooldown') {
        f.actor.progression.spellAvailableAt = 1001
    }
    if (reason === 'range') {
        f.actor.position.x = 300
    }
    if (reason === 'wall') {
        vi.spyOn(f.context.navigation, 'hasLineOfSight').mockReturnValue(false)
    }
    if (reason === 'cross-location') {
        f.actor.locationId = 'map-0-0'
    }
    if (reason === 'purified') {
        f.service.purify('grave', 0)
    }
    if (reason === 'missing') {
        target.id = 'unknown'
    }
    const mana = f.actor.mana
    expect(
        castSpell(
            f.actor,
            {
                type: 'cast_spell',
                skillId: 'fireball',
                target,
                ...(reason === 'dual-target' ? { targetId: 'enemy' } : {}),
            },
            f.context
        )
    ).toEqual([])
    expect(f.actor.mana).toBe(mana)
    expect(f.actor.pendingAttack).toBeUndefined()
})
it('stops at an obstacle added after cast start and protects the grave and character behind it', () => {
    const f = graveCombatFixture('arcanist')
    f.actor.position.x = 30
    f.actor.abilities.known.add('fireball')
    const enemy = f.enemy(110)
    expect(
        castSpell(
            f.actor,
            { type: 'cast_spell', skillId: 'fireball', target: f.reference },
            f.context
        )[0]?.kind
    ).toBe('attack')
    for (let y = 0; y < 32; y += 1) {
        f.context.navigation.grid.solid[y * 32 + 4] = true
    }
    expect(
        f
            .hit(1800)
            .some(
                (event) =>
                    event.targetId === enemy.id || event.kind === 'world_damage'
            )
    ).toBe(false)
    expect(enemy.hp).toBe(enemy.maxHp)
    expect(f.service.get('grave')?.hp).toBe(100)
})
it('automatic grave melee approaches using ordinary reach, pins its target and stops when ruined', () => {
    const f = graveCombatFixture()
    f.actor.position.x = 60
    const action = { kind: 'attack' as const, target: { ...f.reference } }
    expect(
        setCharacterControl(
            f.actor,
            { type: 'auto_action', action },
            f.world,
            1000
        )
    ).toBe(true)
    action.target.id = 'other'
    advanceCharacterControl(f.actor, f.world, 1000)
    expect(snapshotControl(f.actor).waiting).toBe('range')
    expect(f.actor.hasPath()).toBe(true)
    expect(f.events).toEqual([])
    f.actor.position.x = 100
    advanceCharacterControl(f.actor, f.world, 1300)
    expect(f.events[0]).toMatchObject({ kind: 'attack', target: f.reference })
    f.service.damage('grave', 100, 1301)
    expect(resolvePendingAttackHit(f.attack(1350))).toEqual([
        expect.objectContaining({
            kind: 'miss',
            hitQuality: 'miss',
            target: f.reference,
        }),
    ])
    expect(advanceCharacterControl(f.actor, f.world, 1350)).toBe(false)
    expect(snapshotControl(f.actor).mode).toBe('none')
    expect(f.events).toHaveLength(1)
})
it('automatic forward Shot damages stone without practice, silently waits for resources and never starts another attack on cancel', () => {
    const f = graveCombatFixture()
    f.actor.energy = 10
    const masteries = structuredClone(f.actor.progression.masteries)
    expect(
        setCharacterControl(
            f.actor,
            {
                type: 'auto_action',
                action: { kind: 'ability', abilityId: 'shot' },
            },
            f.world,
            1000
        )
    ).toBe(true)
    advanceCharacterControl(f.actor, f.world, 1000)
    f.hit()
    advanceCharacterControl(f.actor, f.world, 1550)
    expect(snapshotControl(f.actor).waiting).toBe('resources')
    expect(f.events).toHaveLength(1)
    f.actor.energy = 10
    advanceCharacterControl(f.actor, f.world, 1600)
    f.hit(1650)
    expect(f.service.get('grave')?.hp).toBe(99.4)
    expect(f.actor.progression.masteries).toEqual(masteries)
    expect(
        setCharacterControl(
            f.actor,
            { type: 'auto_action', action: null },
            f.world,
            1700
        )
    ).toBe(true)
    advanceCharacterControl(f.actor, f.world, 2200)
    expect(f.events).toHaveLength(2)
})

it('uses a normal NPC controller and shared heavy-strike weapon wear without grave stun or practice', () => {
    const f = graveCombatFixture('ranger', 'scripted')
    f.actor.abilities.known.add('skeleton_strike')
    const weapon = createItemInstance('axe')
    f.actor.equipment.weapon = weapon
    const masteries = structuredClone(f.actor.progression.masteries)
    expect(attemptAbilityAttack(f.attack(), 'skeleton_strike')[0]?.kind).toBe(
        'attack'
    )
    expect(f.hit(1599)).toEqual([])
    expect(f.hit(1600)).toEqual([
        {
            kind: 'world_damage',
            actorId: f.actor.id,
            target: f.reference,
            amount: 1.5,
            hitQuality: 'strong',
            critical: false,
            damageKind: 'physical',
            abilityId: 'skeleton_strike',
        },
    ])
    expect(weapon.durability).toBe(995)
    expect(f.actor.progression.masteries).toEqual(masteries)
})

it.each([
    { world: true, late: 0 },
    { world: false, late: 0 },
    { world: true, late: 47 },
    { world: false, late: 47 },
])(
    'keeps Spark hit geometry through timed-state before resolution (world:$world, late:$late)',
    ({ world, late }) => {
        const f = graveCombatFixture('arcanist')
        const enemy = f.enemy(110)
        const context = {
            ...f.attack(1003),
            ...(world ? {} : { target: undefined, targetId: enemy.id }),
        }
        expect(attemptAbilityAttack(context, 'spark')[0]?.kind).toBe('attack')
        const now = 1203 + late
        advanceCharacter({
            character: f.actor,
            now,
            deltaMs: 50,
            navigation: f.context.navigation,
        })
        expect(f.actor.attackZones).not.toEqual([])
        expect(f.hit(now)[0]?.kind).toBe(world ? 'world_damage' : 'damage')
        expect(f.hit(now)).toEqual([])
        f.actor.tickTimedState(now + 50)
        expect(f.actor.attackZones).toEqual([])
    }
)

it.each([
    {
        first: 'fireball' as const,
        next: 'spark' as const,
        windup: 400,
        amount: 6.25,
    },
    {
        first: 'spark' as const,
        next: 'fireball' as const,
        windup: 200,
        amount: 1.25,
    },
])(
    'keeps pending $first target, geometry, damage and costs when $next arrives after its deadline',
    ({ first, next, windup, amount }) => {
        const f = graveCombatFixture('arcanist')
        f.actor.abilities.known.add('fireball')
        const other = { kind: 'grave' as const, id: 'second-grave' }
        f.service.register(
            {
                id: other.id,
                locationId: f.actor.locationId,
                position: { x: 100, y: 175 },
            },
            [],
            0
        )
        expect(f.ability(first, 1003)[0]?.kind).toBe('attack')
        const pending = structuredClone(f.actor.pendingAttack)
        const zones = structuredClone(f.actor.attackZones)
        if (first === 'spark') {
            expect(pending).toMatchObject({ target: f.reference })
        } else {
            expect(magicAttackWindingUp(f.actor)).toBe(true)
        }
        const mana = f.actor.mana,
            energy = f.actor.energy
        expect(
            f
                .ability(next, 1004 + windup, other)
                .every((event) => event.kind === 'notice')
        ).toBe(true)
        expect(f.actor.pendingAttack).toEqual(pending)
        expect(f.actor.attackZones).toEqual(zones)
        expect(f.actor.facing).toBe('right')
        expect(f.actor.mana).toBe(mana)
        expect(f.actor.energy).toBe(energy)
        const events = f.hit(1050 + windup)
        expect(
            events.find((event) => event.kind === 'world_damage')
        ).toMatchObject({
            target: f.reference,
            amount,
        })
        expect(f.service.get(other.id)?.hp).toBe(100)
        expect(f.hit(1050 + windup)).toEqual([])
    }
)
