import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { autoActionStatus } from '../src/game/autoActionRules'
import { setCharacterControl } from '../src/game/characterControl'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { hasRetaliationRight } from '../src/game/crimeRelations'
import { canTargetByFaction } from '../src/game/factions'
import { createItemInstance } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { prayerHarmTargets } from '../src/game/prayerContext'
import { findVisibleTarget } from '../src/game/queries'
import { StationaryController } from '../src/game/trainingTargets'
import { abilityHero, resolveTestSpells } from './abilityTestHelpers'
import { trainingCombatFixture } from './trainingCombatFixture'

describe('shared training target damage', () => {
    it('measures repeated melee impacts, pays costs and wears the weapon without damage consequences', () => {
        const f = trainingCombatFixture()
        const sword = createItemInstance('simple_sword')
        f.actor.equipment.weapon = sword
        const before = structuredClone(f.actor.progression)
        const hp = f.dummy.hp
        const energy = f.actor.energy
        const durability = sword.durability ?? 0
        for (const now of [1000, 2000, 3000]) {
            expect(f.start(now)).toHaveLength(1)
            const events = f.hit(now + 50)
            expect(events).toEqual([
                expect.objectContaining({
                    kind: 'damage',
                    hitQuality: 'normal',
                }),
            ])
            expect(events[0]?.amount).toBeGreaterThan(0)
            expect(f.hit(now + 51)).toEqual([])
        }
        expect(f.actor.energy).toBe(
            energy - f.actor.config.resources.attackEnergyCost * 3
        )
        expect(sword.durability).toBe(durability - 3)
        expect(f.actor.progression).toEqual(before)
        expect(f.actor.inventory).toEqual([])
        expect(f.actor.xp).toBe(0)
        expect(f.dummy.hp).toBe(hp)
        expect(f.dummy.alive).toBe(true)
        expect(f.dummy.stunUntil).toBe(0)
        expect(f.dummy.deathSequence).toBe(0)
        expect(f.dummy.respawnAt).toBe(0)
        expect(f.dummy.energy).toBe(f.dummy.config.resources.maxEnergy)
        expect(f.dummy.animationAction).toBe('idle')
        expect(hasRetaliationRight(f.actor, f.dummy, 4000)).toBe(false)
    })

    it('keeps measured impact separate from barriers, clothing, HP and skill practice', () => {
        const f = trainingCombatFixture()
        const boots = createItemInstance('boots')
        f.dummy.equipment.boots = boots
        const barrier = { remaining: 8, expiresAt: 5000, practiced: false }
        f.dummy.abilities.barrier = barrier
        const before = f.dummy.snapshot(1000)
        const result = resolveCharacterDamage({
            actor: f.actor,
            target: f.dummy,
            amount: 1000,
            now: 1000,
            damageKind: 'physical',
            respawnDelayMs: 1,
        })
        expect(result).toMatchObject({
            hpDamage: 0,
            absorbed: 0,
            trainableDamage: 0,
            impactDamage: 1000,
        })
        expect(result.events).toEqual([
            expect.objectContaining({
                kind: 'damage',
                amount: 1000,
                hitQuality: 'normal',
            }),
        ])
        expect(f.dummy.snapshot(1000)).toEqual(before)
        expect(f.dummy.abilities.barrier).toBe(barrier)
        f.dummy.applyDamage(10000, 1001)
        expect(f.dummy.alive).toBe(true)
        expect(f.dummy.hp).toBe(f.dummy.maxHp)
    })
})

it('measures the shared heavy strike and critical weak attack without applying stun', () => {
    const heavy = trainingCombatFixture()
    heavy.actor.abilities.known.add('skeleton_strike')
    const sword = createItemInstance('simple_sword')
    sword.durability = 1
    heavy.actor.equipment.weapon = sword
    const skills = structuredClone(heavy.actor.progression.masteries)
    expect(heavy.ability('skeleton_strike')[0]?.kind).toBe('attack')
    expect(heavy.hit(1600)).toContainEqual(
        expect.objectContaining({ kind: 'damage' })
    )
    expect(sword.durability).toBe(0)
    expect(heavy.dummy.stunUntil).toBe(0)
    expect(heavy.actor.progression.masteries).toEqual(skills)
    const weak = trainingCombatFixture()
    weak.actor.energy = 0
    expect(weak.start()).toHaveLength(1)
    expect(
        resolvePendingAttackHit({ ...weak.attack(1100), random: () => 0 })
    ).toContainEqual(
        expect.objectContaining({
            kind: 'damage',
            hitQuality: 'critical',
            critical: true,
        })
    )
    expect(weak.dummy.stunUntil).toBe(0)
})

describe('training attack abilities', () => {
    it.each(['shot', 'spark'] as const)(
        'uses ordinary %s costs/cooldowns without granting practice',
        (id) => {
            const f = trainingCombatFixture(
                id === 'shot' ? 'ranger' : 'arcanist'
            )
            const mana = f.actor.mana
            const energy = f.actor.energy
            const before = structuredClone(f.actor.progression)
            expect(f.ability(id)[0]).toMatchObject({
                kind: 'attack',
                abilityId: id,
            })
            expect(f.hit(1000 + ABILITY_DEFINITIONS[id].windupMs)).toEqual([
                expect.objectContaining({
                    kind: 'damage',
                    amount: id === 'shot' ? 6 : 5,
                    hitQuality: 'strong',
                }),
            ])
            expect(f.actor.mana).toBe(mana - ABILITY_DEFINITIONS[id].mana)
            expect(f.actor.energy).toBe(energy - ABILITY_DEFINITIONS[id].energy)
            expect(
                f.ability(id, 1100).some((event) => event.kind === 'attack')
            ).toBe(false)
            expect(f.actor.progression).toEqual(before)
            expect(f.dummy.hp).toBe(f.dummy.maxHp)
        }
    )

    it.each(['fireball', 'greater_fireball'] as const)(
        'measures %s damage without practice or target death',
        (id) => {
            const f = trainingCombatFixture('arcanist')
            f.actor.abilities.known.add(id)
            f.actor.progression.masteries.magic.level = 3
            const before = structuredClone(f.actor.progression)
            const mana = f.actor.mana
            f.dummy.position.y = 220
            expect(f.ability(id)).toHaveLength(1)
            const events = resolveTestSpells(f.actor, f.context)
            expect(events).toContainEqual(
                expect.objectContaining({
                    kind: 'damage',
                    amount: id === 'fireball' ? 25 : 85,
                    hitQuality: 'normal',
                })
            )
            expect(
                events.some(
                    (event) => event.kind === 'death' || event.kind === 'status'
                )
            ).toBe(false)
            expect(f.actor.mana).toBe(mana - ABILITY_DEFINITIONS[id].mana)
            expect(f.actor.progression.masteries).toEqual(before.masteries)
            expect(f.dummy.hp).toBe(f.dummy.maxHp)
        }
    )

    it('resolves simultaneous hits once each and allows weak basic strikes without stunning', () => {
        const f = trainingCombatFixture()
        const other = abilityHero('vanguard')
        f.characters.push(other)
        f.actor.energy = 1
        expect(f.start()).toHaveLength(1)
        expect(attemptAttack(f.attack(1000, other))).toHaveLength(1)
        const second = resolvePendingAttackHit(f.attack(1050, other))
        const first = f.hit(1100)
        expect(first).toContainEqual(
            expect.objectContaining({ kind: 'damage', hitQuality: 'weak' })
        )
        expect(second).toContainEqual(
            expect.objectContaining({ kind: 'damage' })
        )
        expect(f.actor.energy).toBe(0)
        expect(f.dummy.stunUntil).toBe(0)
        expect(f.dummy.hp).toBe(f.dummy.maxHp)
        expect(f.hit(1200)).toEqual([])
        expect(resolvePendingAttackHit(f.attack(1200, other))).toEqual([])
    })
})

describe('training target intentions', () => {
    it('permits explicit and automatic same-faction attacks without faction hostility', () => {
        const f = trainingCombatFixture()
        expect(canTargetByFaction(f.actor, f.dummy, 1000)).toBe(false)
        expect(
            autoActionStatus(
                f.actor,
                { kind: 'attack', targetId: f.dummy.id },
                f.context
            )
        ).toBe('ready')
        expect(
            setCharacterControl(
                f.actor,
                { type: 'auto_attack', targetId: f.dummy.id },
                {
                    getCharacter: (id) =>
                        f.characters.find((entry) => entry.id === id),
                    navigationFor: () => f.context.navigation,
                    requestAttack: () => undefined,
                },
                1000
            )
        ).toBe(true)
        expect(f.start()).toHaveLength(1)
    })

    it('never attracts an ordinary hostile controller or moves from queued intentions', () => {
        const f = trainingCombatFixture()
        const enemy = abilityHero('vanguard', 'undead', 'mob1')
        Object.assign(enemy, { faction: 'monsters' })
        expect(
            findVisibleTarget([f.dummy], f.context.navigation, enemy, 240, 1000)
        ).toBeUndefined()
        f.dummy.setPath([{ x: 150, y: 150 }])
        f.dummy.setMoveInput({ x: 1, y: 0 })
        new StationaryController().update(f.dummy)
        const before = { ...f.dummy.position }
        advanceCharacter({
            character: f.dummy,
            now: 2000,
            deltaMs: 1000,
            navigation: f.context.navigation,
        })
        expect(f.dummy.position).toEqual(before)
        expect(f.dummy.soul.canSpeak).toBe(false)
        expect(f.dummy.snapshot(2000).trainingTarget).toEqual({
            areaId: 'test:training:yard',
        })
        expect(
            attemptAttack({
                ...f.attack(2000),
                actor: f.dummy,
                targetId: f.actor.id,
            })
        ).toEqual([])
        expect(f.actor.exactCombatNumbers).toBe(false)
    })

    it('preserves reach, line of sight, location and broken-weapon validation', () => {
        const f = trainingCombatFixture()
        const energy = f.actor.energy
        f.dummy.position.y = 300
        expect(f.start()).toEqual([])
        f.dummy.position.y = 112
        f.dummy.locationId = 'map-1-1'
        expect(f.start()).toEqual([])
        f.dummy.locationId = f.actor.locationId
        f.actor.equipment.weapon = createItemInstance('simple_sword')
        f.actor.equipment.weapon.durability = 0
        expect(f.start()).toEqual([])
        delete f.actor.equipment.weapon
        f.dummy.position.y = 132
        const tile = f.context.navigation.worldToTile({ x: 100, y: 116 })
        f.context.navigation.grid.solid[tile.y * 32 + tile.x] = true
        expect(
            f.ability('spark').some((event) => event.kind === 'attack')
        ).toBe(false)
        expect(f.actor.energy).toBe(energy)
    })

    it.each(['hearth', 'grave', 'road', 'lantern'] as const)(
        'keeps %s prayers from harming the wooden construct',
        (patron) => {
            const f = trainingCombatFixture('cleric')
            f.actor.progression.patron = patron
            expect(prayerHarmTargets(f.actor, f.context)).not.toContain(f.dummy)
            expect(
                handleAbilityCommand(
                    f.actor,
                    {
                        type: 'use_ability',
                        abilityId: 'pray',
                        intent: { mode: 'harm', targetId: f.dummy.id },
                    },
                    f.context
                ).some((event) => event.kind === 'damage')
            ).toBe(false)
            expect(f.dummy.hp).toBe(f.dummy.maxHp)
            expect(f.actor.progression.masteries.prayer.experience).toBe(0n)
            expect(f.actor.progression.masteries.prayer.level).toBe(0)
        }
    )
})
