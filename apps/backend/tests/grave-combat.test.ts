import { type ItemId, materialDamage } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { createItemInstance } from '../src/game/inventory'
import { graveCombatFixture } from './graveCombatFixture'

it.each<[ItemId | undefined, number, number]>([
    [undefined, 0.75, 0],
    ['old_sword', 1.25, 1],
    ['simple_sword', 2.25, 1],
    ['axe', 1.5, 5],
    ['stone_axe', 0.75, 5],
    ['pickaxe', 5, 5],
])(
    'applies stone mitigation after the raw melee roll with %s and ordinary wear',
    (itemId, amount, wear) => {
        const f = graveCombatFixture()
        const weapon =
            itemId === undefined ? undefined : createItemInstance(itemId)
        if (weapon !== undefined) {
            f.actor.equipment.weapon = weapon
        }
        const condition = weapon?.durability ?? 0
        const skills = structuredClone(f.actor.progression.masteries)
        expect(attemptAttack(f.attack())[0]).toMatchObject({
            kind: 'attack',
            target: f.reference,
        })
        expect(f.service.get('grave')?.hp).toBe(100)
        expect(f.hit(1049)).toEqual([])
        expect(f.hit()).toEqual([
            {
                kind: 'world_damage',
                actorId: f.actor.id,
                target: f.reference,
                amount,
                critical: false,
                hitQuality:
                    itemId === undefined ||
                    itemId === 'simple_sword' ||
                    itemId === 'stone_axe'
                        ? 'normal'
                        : 'strong',
                damageKind: 'physical',
            },
        ])
        expect(f.service.get('grave')?.hp).toBe(100 - amount)
        expect(weapon?.durability ?? 0).toBe(condition - wear)
        expect(f.actor.progression.masteries).toEqual(skills)
        expect(f.actor.inventory).toEqual([])
        expect(f.hit()).toEqual([])
    }
)
it('mitigates a critical roll after its multiplier, retains sub-one damage and never invents minimum damage', () => {
    const f = graveCombatFixture()
    f.actor.equipment.weapon = createItemInstance('simple_sword')
    attemptAttack(f.attack())
    const random = vi.fn().mockReturnValueOnce(0.5).mockReturnValueOnce(0)
    expect(f.actor.config.combat.critMultiplier).toBe(1.6)
    const context = f.attack(1050)
    context.random = random
    // A raw9 roll becomes14 on critical; stone receives3.5.
    expect(resolvePendingAttackHit(context)[0]).toMatchObject({
        amount: 3.5,
        critical: true,
    })
    expect(materialDamage('stone', 'projectile', 1)).toBe(0.05)
    expect(materialDamage('stone', 'projectile', 0.001)).toBe(0)
})
it.each([
    'broken',
    'far',
    'other-location',
    'blocked',
    'missing',
    'ruined',
    'purified',
    'offline',
    'dead',
    'retired',
    'dual-target',
] as const)('rejects %s before costs or a pending attack', (reason) => {
    const f = graveCombatFixture()
    const request = f.attack()
    if (reason === 'broken') {
        f.actor.equipment.weapon = {
            ...createItemInstance('simple_sword'),
            durability: 0,
        }
    }
    if (reason === 'far') {
        f.actor.position.x = 10
    }
    if (reason === 'other-location') {
        f.actor.locationId = 'map-0-0'
    }
    if (reason === 'blocked') {
        vi.spyOn(f.context.navigation, 'hasLineOfSight').mockReturnValue(false)
    }
    if (reason === 'missing') {
        request.target = { kind: 'grave', id: 'unknown' }
    }
    if (reason === 'ruined') {
        f.service.damage('grave', 100, 0)
    }
    if (reason === 'purified') {
        f.service.purify('grave', 0)
    }
    if (reason === 'offline') {
        f.actor.tags.add('offline')
    }
    if (reason === 'dead') {
        f.actor.alive = false
    }
    if (reason === 'retired') {
        f.actor.tags.add('state.retired')
    }
    if (reason === 'dual-target') {
        request.targetId = f.enemy(110).id
    }
    const energy = f.actor.energy
    expect(attemptAttack(request)).toEqual([])
    expect(f.actor.energy).toBe(energy)
    expect(f.actor.pendingAttack).toBeUndefined()
})
it.each([
    'swap',
    'break',
    'equip',
    'travel',
    'offline',
    'dead',
    'wall',
    'out-of-range',
    'ruin',
    'purify',
] as const)(
    'revalidates %s at windup resolution without retargeting or wear',
    (reason) => {
        const f = graveCombatFixture()
        const sword = createItemInstance('simple_sword')
        if (reason !== 'equip') {
            f.actor.equipment.weapon = sword
        }
        const enemy = f.enemy(110)
        expect(attemptAttack(f.attack())[0]?.kind).toBe('attack')
        if (reason === 'swap') {
            f.actor.equipment.weapon = createItemInstance('simple_sword')
        }
        if (reason === 'break') {
            sword.durability = 0
        }
        if (reason === 'equip') {
            f.actor.equipment.weapon = sword
        }
        if (reason === 'travel') {
            f.actor.locationId = 'map-0-0'
        }
        if (reason === 'offline') {
            f.actor.tags.add('offline')
        }
        if (reason === 'dead') {
            f.actor.alive = false
        }
        if (reason === 'wall') {
            vi.spyOn(f.context.navigation, 'hasLineOfSight').mockReturnValue(
                false
            )
        }
        if (reason === 'out-of-range') {
            f.actor.attackZones = []
        }
        if (reason === 'ruin') {
            f.service.damage('grave', 100, 0)
        }
        if (reason === 'purify') {
            f.service.purify('grave', 0)
        }
        const hp = f.service.get('grave')?.hp
        const misses = [
            'travel',
            'wall',
            'out-of-range',
            'ruin',
            'purify',
        ].includes(reason)
        expect(f.hit()).toEqual(
            misses
                ? [
                      expect.objectContaining({
                          kind: 'miss',
                          hitQuality: 'miss',
                          target: f.reference,
                      }),
                  ]
                : []
        )
        expect(f.service.get('grave')?.hp).toBe(hp)
        expect(enemy.hp).toBe(enemy.maxHp)
        expect(sword.durability).toBe(reason === 'break' ? 0 : 200)
    }
)
it('pins a copied grave reference and emits one world ruin outcome without character rewards', () => {
    const f = graveCombatFixture()
    f.service.damage('grave', 99.99, 0)
    const target = { ...f.reference }
    expect(attemptAttack({ ...f.attack(), target })[0]?.kind).toBe('attack')
    target.id = 'different'
    expect(f.hit()).toEqual([
        {
            kind: 'world_damage',
            actorId: f.actor.id,
            target: f.reference,
            amount: 0.01,
            critical: false,
            hitQuality: 'normal',
            damageKind: 'physical',
        },
        { kind: 'grave_ruined', actorId: f.actor.id, target: f.reference },
    ])
    expect(f.hit()).toEqual([])
    expect(f.service.get('grave')?.phase).toBe('ruined')
    expect(attemptAttack(f.attack(2000))).toEqual([])
})
