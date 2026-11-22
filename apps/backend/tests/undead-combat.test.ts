import type { GameEventPayload } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { toggleDefensiveStance } from '../src/game/bladeStance'
import { GameCharacter } from '../src/game/character'
import type { PendingAttackHit } from '../src/game/characterState'
import {
    attemptAbilityAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { resolveContactBatch } from '../src/game/combatContacts'
import { defendContact } from '../src/game/combatDefense'
import { effectiveAbility } from '../src/game/effectiveParameters'
import { createItemInstance } from '../src/game/inventory'
import { abilityHero } from './abilityTestHelpers'

function fight(...stars: string[]) {
    const target = abilityHero('cleric')
    const bone = new GameCharacter({
        id: `bone-${target.id}`,
        nickname: 'Skeleton',
        controllerKind: 'mob1',
        faction: 'monsters',
        archetype: 'skeleton',
        spawnPosition: { x: 100, y: 100 },
    })
    target.position = { x: 100, y: 112 }
    target.baseMaxHp = 200
    target.hp = 200
    bone.facing = 'down'
    for (const star of stars) {
        bone.progression.constellations.opened.add(`undead.${star}`)
    }
    return { bone, target }
}

function context(
    actor: GameCharacter,
    target: GameCharacter,
    now: number,
    random = () => 0.99
) {
    return {
        actor,
        targets: [target],
        targetId: target.id,
        tileSize: 16,
        now,
        random,
        respawnDelayMsFor: () => 15_000,
    }
}

function attack(overrides: Partial<PendingAttackHit> = {}): PendingAttackHit {
    return {
        canStun: false,
        delivery: 'melee_physical',
        damageMultiplier: 2,
        hitAt: 0,
        targetEnergyDrain: 0,
        ...overrides,
    }
}

function hit(
    actor: GameCharacter,
    target: GameCharacter,
    now: number,
    overrides: Partial<PendingAttackHit> = {},
    random?: () => number
) {
    return resolveContactBatch(
        context(actor, target, now, random),
        attack(overrides),
        [target]
    )
}

function damage(events: readonly GameEventPayload[]): number {
    return events.find((event) => event.kind === 'damage')?.amount ?? 0
}

it('adds melee armor at high health and trades defense for damage while cracked', () => {
    const { bone, target } = fight('dense_bone', 'cracked')
    expect(damage(hit(target, bone, 1000))).toBe(7)
    bone.hp = 17.5
    expect(
        damage(
            hit(target, bone, 1100, {
                abilityId: 'shot',
                delivery: 'ranged_physical',
                damageMultiplier: 1,
            })
        )
    ).toBe(8)
    expect(damage(hit(bone, target, 1200))).toBe(18)
})

it.each([
    ['splinters', 'melee_physical', 18, 4000],
    ['anvil', 'melee_physical', 19, 7000],
    ['grudge', 'ranged_physical', 18, 6000],
] as const)(
    'spends %s on the first useful strike against the remembered aggressor',
    (star, delivery, boosted, duration) => {
        const { bone, target } = fight('dense_bone', 'splinters', star)
        const other = fight().target
        const start = 1000
        hit(target, bone, start, { delivery })
        expect(damage(hit(bone, other, start + 1))).toBe(16)
        expect(damage(hit(bone, target, start + duration - 1))).toBe(boosted)
        expect(damage(hit(bone, target, start + duration))).toBe(16)
        bone.hp = bone.maxHp
        hit(target, bone, 10_000, { delivery })
        expect(damage(hit(bone, target, 10_000 + duration))).toBe(16)
    }
)

it('raises melee critical chance only at the low-health threshold', () => {
    const { bone, target } = fight('splinter_edge')
    const hitAt = (hp: number) => {
        bone.hp = hp
        return hit(bone, target, 1000, {}, () => 0.15).find(
            (event) => event.kind === 'damage'
        )
    }
    expect(hitAt(16)?.critical).toBe(false)
    expect(hitAt(15)?.critical).toBe(true)
})

it('keeps low-health healing one per action and up to twelve HP per rolling window', () => {
    const { bone, target } = fight('nothing_to_lose')
    const recover = (now: number, actionId: string) => {
        bone.hp = 5
        hit(bone, target, now, { actionId })
        return bone.hp - 5
    }
    expect(recover(1000, 'first')).toBe(3)
    expect(recover(1000, 'first')).toBe(0)
    expect(recover(1500, 'second')).toBe(3)
    expect(recover(2000, 'third')).toBe(3)
    expect(recover(2500, 'fourth')).toBe(3)
    expect(recover(10_999, 'too-early')).toBe(0)
    expect(recover(11_000, 'fifth')).toBe(3)
    Object.assign(target, { faction: bone.faction })
    expect(recover(12_000, 'friendly')).toBe(0)
})

it('uses the learned Bone Strike windup and punishes a real recovery window', () => {
    const { bone, target } = fight('bone_windup', 'read_recovery')
    expect(effectiveAbility(bone, 'skeleton_strike').windupMs).toBe(800)
    bone.progression.constellations.opened.add('undead.feint')
    expect(effectiveAbility(bone, 'skeleton_strike').windupMs).toBe(680)
    target.combat.action = {
        id: 'opponent-attack',
        startedAt: 1680,
        hitAt: 1750,
        readyAt: 2000,
        movementAt: 2000,
        origin: 'basic',
        geometry: { kind: 'rectangles', zones: [] },
    }
    expect(
        attemptAbilityAttack(context(bone, target, 1100), 'skeleton_strike')
    ).toHaveLength(1)
    expect(resolvePendingAttackHit(context(bone, target, 1779))).toEqual([])
    expect(damage(resolvePendingAttackHit(context(bone, target, 1780)))).toBe(
        12
    )
})

it('interrupts a heavy windup on hostile HP loss and retains its paid costs', () => {
    const { bone, target } = fight('bone_windup')
    expect(
        attemptAbilityAttack(context(bone, target, 1000), 'skeleton_strike')
    ).toHaveLength(1)
    const readyAt = bone.combat.readyAt
    const cooldown = bone.abilities.availableAt.skeleton_strike
    const energy = bone.energy
    const result = resolveCharacterDamage({
        actor: target,
        target: bone,
        amount: 3,
        damageKind: 'arcane',
        now: 1799,
        respawnDelayMs: 15_000,
    })
    expect(result.trainableDamage).toBe(3)
    expect(resolvePendingAttackHit(context(bone, target, 1800))).toEqual([])
    expect(bone.energy).toBe(energy)
    expect(bone.combat.readyAt).toBe(readyAt)
    expect(bone.abilities.availableAt.skeleton_strike).toBe(cooldown)
})

it('charges extra energy only on a paid guard and lengthens a low-energy stun', () => {
    const { bone, target } = fight('shatter_guard', 'dull_ring')
    target.equipment.weapon = createItemInstance('simple_sword')
    target.progression.constellations.opened.add('blade.defensive_stance')
    expect(toggleDefensiveStance(target, 900)).toHaveLength(1)
    const strike = attack({ abilityId: 'skeleton_strike', canStun: true })
    const energy = target.energy
    const defended = defendContact(bone, target, strike, 1000, () => 0.99)
    expect(defended.paidGuard).toBe(true)
    const learnedCost = energy - target.energy
    target.energy = energy
    bone.progression.constellations.opened.delete('undead.shatter_guard')
    expect(
        defendContact(bone, target, strike, 1001, () => 0.99).paidGuard
    ).toBe(true)
    expect(learnedCost).toBe(energy - target.energy + 8)
    target.combat.defensiveStance = false
    target.energy = 20
    expect(hit(bone, target, 2000, strike)).toContainEqual(
        expect.objectContaining({ kind: 'status', expiresAt: 3000 })
    )
})

it('refunds marrow only after contact with an organic hostile', () => {
    const { bone, target } = fight('marrow_draw')
    bone.energy = 50
    expect(
        attemptAbilityAttack(context(bone, target, 1000), 'skeleton_strike')
    ).toHaveLength(1)
    expect(bone.energy).toBe(26)
    expect(damage(resolvePendingAttackHit(context(bone, target, 1600)))).toBe(8)
    expect(bone.energy).toBe(30)
    const undead = fight().bone
    Object.assign(undead, { faction: 'peaceful' })
    hit(bone, undead, 3000, { abilityId: 'skeleton_strike' })
    expect(bone.energy).toBe(30)
})
