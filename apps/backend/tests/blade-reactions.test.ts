import type {
    AttackDelivery,
    CharacterControllerKind,
    GameEventPayload,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { toggleDefensiveStance } from '../src/game/bladeStance'
import { setCharacterControlSource } from '../src/game/characterSoul'
import type { PendingAttackHit } from '../src/game/characterState'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { resolveContactBatch } from '../src/game/combatContacts'
import { defendContact } from '../src/game/combatDefense'
import { effectiveAttackEnergyCost } from '../src/game/effectiveParameters'
import { createItemInstance } from '../src/game/inventory'
import { bladeDuel } from './bladeCombatFixture'

type Duel = ReturnType<typeof bladeDuel>
const incoming = (
    delivery: AttackDelivery = 'melee_physical'
): PendingAttackHit => ({
    actionId: 'incoming-action',
    origin: 'basic',
    delivery,
    hitAt: 1000,
    canStun: false,
    damageMultiplier: 1,
    targetEnergyDrain: 8,
})
function retaliator(controller: CharacterControllerKind = 'network_player') {
    const f = bladeDuel('cleric', controller)
    f.actor.baseMaxHp = 1000
    f.actor.hp = 1000
    for (const id of ['blade.dodge', 'blade.counterattack']) {
        f.actor.progression.constellations.opened.add(id)
    }
    return f
}
function incomingContact(
    f: Duel,
    attack = incoming(),
    random = () => 0.05
): GameEventPayload[] {
    // A common contact unit fixture isolates reaction validation from the outer target selector.
    return resolveContactBatch(
        {
            ...f.attack,
            actor: f.target,
            targetId: f.actor.id,
            now: 1000,
            random,
        },
        attack,
        [f.actor]
    )
}
function counterEvents(events: GameEventPayload[]) {
    return events.filter((event) => event.attackOrigin === 'counter')
}
function guard(strong = false, longFrontier = false) {
    const f = bladeDuel()
    const stars = f.target.progression.constellations.opened
    stars.add('blade.defensive_stance')
    if (strong) {
        stars.add('blade.guard_strong')
    }
    if (longFrontier) {
        stars.add('blade.long_frontier')
    }
    expect(toggleDefensiveStance(f.target, 900)).toHaveLength(1)
    return f
}
function guardedContact(
    f: Duel,
    attack = incoming(),
    random = () => 0.99
): GameEventPayload[] {
    return resolveContactBatch({ ...f.attack, now: 1000, random }, attack, [
        f.target,
    ])
}
function totalDamage(events: GameEventPayload[], id: string): number {
    return events
        .filter((event) => event.kind === 'damage' && event.targetId === id)
        .reduce((sum, event) => sum + (event.amount ?? 0), 0)
}

describe('automatic counter as an immediate independent reaction', () => {
    it('hits during an own pending strike without changing pending identity, deadline or animation', () => {
        const f = retaliator()
        expect(attemptAttack(f.attack)).toHaveLength(1)
        const pending = f.actor.pendingAttack
        const action = f.actor.combat.action
        const available = { ...f.actor.abilities.availableAt }
        const animation = {
            action: f.actor.animationAction,
            at: f.actor.animationStartedAt,
            until: f.actor.animationUntil,
        }
        const readyAt = f.actor.combat.readyAt
        const energy = f.actor.energy
        const hp = f.target.hp
        const events = incomingContact(f)
        expect(events.filter((event) => event.kind === 'parry')).toHaveLength(1)
        expect(
            counterEvents(events).filter((event) => event.kind === 'attack')
        ).toHaveLength(1)
        expect(totalDamage(events, f.target.id)).toBeGreaterThan(0)
        expect(f.target.hp).toBeLessThan(hp)
        expect(f.actor.energy).toBe(energy - 5 - 15)
        expect(f.actor.pendingAttack).toBe(pending)
        expect(f.actor.combat.action).toBe(action)
        expect(f.actor.combat.readyAt).toBe(readyAt)
        expect(f.actor.lastAttackAt).toBe(1000)
        expect(f.actor.abilities.availableAt).toEqual(available)
        expect({
            action: f.actor.animationAction,
            at: f.actor.animationStartedAt,
            until: f.actor.animationUntil,
        }).toEqual(animation)
        expect(resolvePendingAttackHit(f.at(1049))).toEqual([])
        expect(
            totalDamage(resolvePendingAttackHit(f.at(1050)), f.target.id)
        ).toBeGreaterThan(0)
        expect(f.actor.combat.readyAt).toBe(1450)
    })

    it('pays the effective learned ordinary price without waiting for or creating a cooldown', () => {
        const f = retaliator()
        for (const id of ['blade.root', 'blade.economy', 'blade.economy2']) {
            f.actor.progression.constellations.opened.add(id)
        }
        const price = effectiveAttackEnergyCost(f.actor)
        expect(price).toBe(11)
        f.actor.energy = 5 + price
        f.actor.combat.readyAt = 9000
        f.actor.lastAttackAt = 8900
        const events = incomingContact(f)
        expect(totalDamage(events, f.target.id)).toBeGreaterThan(0)
        expect(f.actor.energy).toBe(0)
        expect(f.actor.combat.readyAt).toBe(9000)
        expect(f.actor.lastAttackAt).toBe(8900)
        expect(f.actor.abilities.availableAt).toEqual({})
    })
})

describe('counter parrying and shared controller rules', () => {
    it.each(['network_player', 'scripted', 'mob1'] as const)(
        'keeps passive reactions available to the same living Echo under %s controller',
        (controller) => {
            const f = retaliator(controller)
            f.actor.connected = false
            setCharacterControlSource(f.actor, 'script')
            expect(f.actor.soul.kind).toBe('echo')
            const events = incomingContact(f)
            expect(
                counterEvents(events).filter((event) => event.kind === 'attack')
            ).toHaveLength(1)
            expect(totalDamage(events, f.target.id)).toBeGreaterThan(0)
        }
    )

    it('permits parrying the answer without recursively generating another answer', () => {
        const f = retaliator()
        for (const id of ['blade.dodge', 'blade.counterattack']) {
            f.target.progression.constellations.opened.add(id)
        }
        const hp = [f.actor.hp, f.target.hp]
        const events = incomingContact(f)
        expect(events.filter((event) => event.kind === 'parry')).toHaveLength(2)
        expect(
            counterEvents(events).filter((event) => event.kind === 'attack')
        ).toHaveLength(1)
        expect(events.filter((event) => event.kind === 'damage')).toHaveLength(
            0
        )
        expect([f.actor.hp, f.target.hp]).toEqual(hp)
        expect(f.actor.energy).toBe(80)
        expect(f.target.energy).toBe(95)
    })
})

describe('counter availability boundaries', () => {
    const denied = [
        [
            'broken blade',
            (f: Duel) => {
                const sword = createItemInstance('old_sword')
                sword.durability = 0
                f.actor.equipment.weapon = sword
            },
        ],
        [
            'incompatible axe',
            (f: Duel) => {
                f.actor.equipment.weapon = createItemInstance('axe')
            },
        ],
        [
            'energy',
            (f: Duel) => {
                f.actor.energy = 19
            },
        ],
        [
            'outside reach',
            (f: Duel) => {
                f.target.position.y = 200
            },
        ],
        [
            'line of sight',
            (f: Duel) => {
                f.target.position.y = 132
                f.navigation.grid.solid[7 * 32 + 6] = true
            },
        ],
        [
            'dead responder',
            (f: Duel) => {
                f.actor.applyDamage(f.actor.hp, 950)
            },
        ],
        [
            'dead attacker',
            (f: Duel) => {
                f.target.applyDamage(f.target.hp, 950)
            },
        ],
        [
            'stunned responder',
            (f: Duel) => {
                f.actor.stunUntil = 2000
            },
        ],
        [
            'praying responder',
            (f: Duel) => {
                f.actor.abilities.casting = {
                    targetId: f.actor.id,
                    abilityId: 'pray',
                    receiptId: 'prayer',
                    startedAt: 900,
                    completesAt: 5000,
                    patron: f.actor.progression.patron,
                }
            },
        ],
        [
            'held defense',
            (f: Duel) => {
                f.actor.progression.constellations.opened.add(
                    'blade.defensive_stance'
                )
                toggleDefensiveStance(f.actor, 900)
            },
        ],
        [
            'different location',
            (f: Duel) => {
                f.target.locationId = 'map-1-2'
            },
        ],
    ] as const
    it.each(denied)('does not answer with %s', (_name, arrange) => {
        const f = retaliator()
        arrange(f)
        expect(counterEvents(incomingContact(f))).toEqual([])
        expect(f.actor.path).toEqual([])
    })
})

describe('one disjoint paid defense result', () => {
    it.each([
        [0.1, 'miss', 95],
        [0.2, 'parry', 95],
        [0.4, 'damage', 92],
    ] as const)(
        'resolves sample %s exactly once as %s',
        (sample, kind, energy) => {
            const f = bladeDuel()
            for (const id of [
                'blade.root',
                'blade.ideal_position',
                'blade.dodge2',
            ]) {
                f.target.progression.constellations.opened.add(id)
            }
            const events = resolveContactBatch(
                { ...f.attack, random: () => sample },
                incoming(),
                [f.target]
            )
            expect(
                events.filter((event) =>
                    ['miss', 'parry', 'damage'].includes(event.kind)
                )
            ).toHaveLength(1)
            expect(events).toContainEqual(
                expect.objectContaining({ kind, targetId: f.target.id })
            )
            expect(f.target.energy).toBe(energy)
        }
    )

    it('caps the combined roll at 95% and cannot pay for defense with four energy', () => {
        const f = bladeDuel()
        f.target.config.combat.dodgeChance = 0.95
        f.target.progression.constellations.opened.add('blade.dodge2')
        expect(
            defendContact(f.actor, f.target, incoming(), 1000, () => 0.949)
                .outcome
        ).toBe('dodge')
        expect(
            defendContact(f.actor, f.target, incoming(), 1000, () => 0.95)
                .outcome
        ).toBe('hit')
        f.target.energy = 4
        expect(
            defendContact(f.actor, f.target, incoming(), 1000, () => 0).outcome
        ).toBe('hit')
        expect(f.target.energy).toBe(4)
    })

    it.each(['ranged_physical', 'magic'] as const)(
        'never applies ordinary melee parrying to %s',
        (delivery) => {
            const f = bladeDuel()
            f.target.progression.constellations.opened.add('blade.dodge2')
            expect(
                defendContact(
                    f.actor,
                    f.target,
                    incoming(delivery),
                    1000,
                    () => 0.05
                ).outcome
            ).toBe('hit')
            expect(f.target.energy).toBe(100)
        }
    )
})

describe('paid defensive stance outcomes', () => {
    it.each([
        [false, 'melee_physical', 0.5],
        [false, 'ranged_physical', 0.75],
        [false, 'magic', 1],
        [true, 'melee_physical', 0.3],
        [true, 'ranged_physical', 0.65],
        [true, 'magic', 1],
    ] as const)(
        'uses the exact reduction for strong=%s and %s',
        (strong, delivery, multiplier) => {
            const f = guard(strong)
            const defense = defendContact(
                f.actor,
                f.target,
                incoming(delivery),
                1000,
                () => 0.99
            )
            expect(defense.outcome).toBe('hit')
            expect(defense.multiplier).toBeCloseTo(multiplier)
            expect(f.target.energy).toBe(delivery === 'magic' ? 100 : 93)
            expect(defense.paidGuard).toBe(delivery !== 'magic')
        }
    )

    it.each([false, true])(
        'fully protects the last affordable hit with Long Frontier=%s then exits before the next contact',
        (long) => {
            const f = guard(false, long)
            const price = long ? 5 : 7
            f.target.energy = price
            const hp = f.target.hp
            const first = guardedContact(f)
            expect(totalDamage(first, f.target.id)).toBe(2)
            expect(f.target.hp).toBe(hp - 2)
            expect(f.target.energy).toBe(0)
            expect(f.target.combat.defensiveStance).toBe(true)
            const next = guardedContact(f)
            expect(totalDamage(next, f.target.id)).toBe(4)
            expect(f.target.hp).toBe(hp - 6)
            expect(f.target.combat.defensiveStance).toBe(false)
            expect(f.target.combat.stanceAvailableAt).toBe(2000)
        }
    )

    it('replaces hit energy once, and Armor Break sets one total twenty-energy loss', () => {
        const normal = guard()
        guardedContact(normal)
        expect(normal.target.energy).toBe(93)
        const broken = guard()
        const attack = {
            ...incoming(),
            abilityId: 'pommel_strike' as const,
            damageMultiplier: 0.25,
            targetEnergyDrain: 20,
        }
        guardedContact(broken, attack)
        expect(broken.target.energy).toBe(80)
        expect(broken.target.hp).toBeLessThan(1000)
    })

    it('charges a parry five once while ordinary dodge stays disabled in stance', () => {
        const f = guard()
        f.target.config.combat.dodgeChance = 0.95
        const result = defendContact(
            f.actor,
            f.target,
            incoming(),
            1000,
            () => 0.05
        )
        expect(result.outcome).toBe('parry')
        expect(f.target.energy).toBe(95)
        expect(result.events).toHaveLength(1)
    })

    it('gives Arrow Deflection exactly ten percent only while the stance is held', () => {
        const f = guard()
        f.target.progression.constellations.opened.add('blade.arrow_deflect')
        const arrow = incoming('ranged_physical')
        expect(
            defendContact(f.actor, f.target, arrow, 1000, () => 0.099).outcome
        ).toBe('parry')
        expect(f.target.energy).toBe(95)
        expect(
            defendContact(f.actor, f.target, arrow, 1000, () => 0.1).outcome
        ).toBe('hit')
        expect(f.target.energy).toBe(88)
        f.target.combat.defensiveStance = false
        expect(
            defendContact(f.actor, f.target, arrow, 1000, () => 0.05).outcome
        ).toBe('hit')
        expect(f.target.energy).toBe(88)
    })
})
