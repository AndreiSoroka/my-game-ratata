import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { GameCharacter } from '../src/game/character'
import { advanceMagicChannel } from '../src/game/magicAbilities'
import { magicBlocksMovement, magicCombatFor } from '../src/game/magicState'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import {
    abilityContext,
    abilityHero,
    resolveTestSpells,
} from './abilityTestHelpers'

const start = 1000

function encounter(random = () => 0) {
    const caster = abilityHero('arcanist')
    const ally = abilityHero('arcanist')
    const enemy = abilityHero('arcanist')
    Object.assign(enemy, { faction: 'monsters' })
    ally.position = { x: 116, y: 100 }
    enemy.position = { x: 132, y: 100 }
    caster.facing = 'right'
    for (const ability of [
        'chains',
        'fireball',
        'greater_fireball',
        'blink',
        'dispel_magic',
        'city_portal',
    ] as const) {
        caster.abilities.known.add(ability)
        ally.abilities.known.add(ability)
        enemy.abilities.known.add(ability)
    }
    const context = abilityContext([caster, ally, enemy], start, random)
    return { caster, ally, enemy, context }
}

type ActiveSpell =
    | 'chains'
    | 'fireball'
    | 'greater_fireball'
    | 'blink'
    | 'dispel_magic'
    | 'city_portal'
function cast(
    actor: GameCharacter,
    abilityId: ActiveSpell,
    context: ReturnType<typeof abilityContext>,
    targetId?: string
) {
    return handleAbilityCommand(
        actor,
        {
            type: 'use_ability',
            abilityId,
            ...(targetId === undefined ? {} : { targetId }),
        },
        context
    )
}

describe('Оковы', () => {
    it('blocks both factions, charges only while the field lives and starts cooldown on release', () => {
        const { caster, ally, enemy, context } = encounter()
        expect(cast(caster, 'chains', context)).toMatchObject([
            { phase: 'started', expiresAt: 6000 },
        ])
        expect(caster.mana).toBe(65)
        expect(magicBlocksMovement(ally, start)).toBe(true)
        expect(magicBlocksMovement(enemy, start)).toBe(true)
        const prior = { ...enemy.position }
        enemy.setMoveInput({ x: 1, y: 0 })
        advanceCharacter({
            character: enemy,
            navigation: context.navigation,
            now: 1500,
            deltaMs: 500,
        })
        expect(enemy.position).toEqual(prior)
        expect(caster.progression.masteries.magic.experience).toBe(30_000_000n)
        advanceCharacter({
            character: enemy,
            navigation: context.navigation,
            now: 1600,
            deltaMs: 100,
        })
        expect(caster.progression.masteries.magic.experience).toBe(30_000_000n)
        expect(handleMovementCommand(enemy, { type: 'dash' }, 1500)).toEqual([])
        expect(cast(enemy, 'blink', { ...context, now: 1500 })).toMatchObject([
            { kind: 'notice' },
        ])
        expect(advanceMagicChannel(caster, { ...context, now: 3500 })).toEqual(
            []
        )
        expect(caster.mana).toBe(50)
        expect(
            advanceMagicChannel(caster, { ...context, now: 6000 })
        ).toMatchObject([{ phase: 'completed' }])
        expect(caster.mana).toBe(35)
        expect(caster.abilities.availableAt.chains).toBe(24000)
        expect(magicBlocksMovement(ally, 6000)).toBe(false)
        expect(
            cast(caster, 'chains', { ...context, now: 23999 })
        ).toMatchObject([{ kind: 'notice' }])
    })

    it('uses current party membership, walls and movement entry, then releases on HP damage', () => {
        const { caster, ally, enemy, context } = encounter()
        caster.progression.constellations.opened.add('magic.chains_duration')
        caster.progression.constellations.opened.add('magic.chains_party')
        let inParty = true
        context.sameParty = (_first, second) => second === ally.id && inParty
        enemy.position = { x: 170, y: 100 }
        expect(cast(caster, 'chains', context)).toMatchObject([
            { expiresAt: 11000 },
        ])
        expect(magicBlocksMovement(ally, start)).toBe(false)
        inParty = false
        expect(magicBlocksMovement(ally, start)).toBe(true)
        enemy.setMoveInput({ x: -1, y: 0 })
        advanceCharacter({
            character: enemy,
            navigation: context.navigation,
            now: 2000,
            deltaMs: 1000,
        })
        expect(enemy.position.x).toBeGreaterThan(145)
        expect(enemy.position.x).toBeLessThanOrEqual(148)
        context.navigation.grid.solid[6 * 32 + 8] = true
        expect(magicBlocksMovement(enemy, 2000)).toBe(false)
        resolveCharacterDamage({
            actor: enemy,
            target: caster,
            amount: 1,
            now: 2000,
            respawnDelayMs: 0,
            damageKind: 'arcane',
            random: () => 0,
        })
        expect(magicBlocksMovement(ally, 2000)).toBe(false)
        expect(caster.abilities.availableAt.chains).toBe(20000)
        expect(caster.mana).toBe(59)
    })

    it('ends early when drained and removes either side with Dispel', () => {
        const { caster, ally, enemy, context } = encounter()
        caster.mana = 11
        cast(caster, 'chains', context)
        expect(
            advanceMagicChannel(caster, { ...context, now: 2000 })
        ).toMatchObject([{ phase: 'interrupted' }])
        expect(caster.mana).toBe(0)
        caster.mana = 70
        cast(caster, 'chains', { ...context, now: 20000 })
        cast(enemy, 'chains', { ...context, now: 20000 })
        ally.abilities.barrier = { expiresAt: 22000, practiced: false }
        enemy.abilities.barrier = { expiresAt: 22000, practiced: false }
        expect(
            cast(caster, 'dispel_magic', { ...context, now: 20100 }).filter(
                (event) => event.phase === 'interrupted'
            )
        ).toHaveLength(2)
        expect(ally.abilities.barrier).toBeNull()
        expect(enemy.abilities.barrier).toBeNull()
        expect(caster.progression.masteries.magic.experience).toBe(30_000_000n)
        expect(magicBlocksMovement(ally, 20100)).toBe(false)
    })
})

describe('Скачок', () => {
    it('moves straight backwards without crossing walls or spending while blocked', () => {
        const { caster, context } = encounter()
        expect(cast(caster, 'blink', context)).toMatchObject([
            { phase: 'completed', position: { x: 52, y: 100 } },
        ])
        expect(caster.mana).toBe(60)
        expect(caster.facing).toBe('right')
        caster.position.x = 64
        context.navigation.grid.solid[6 * 32 + 3] = true
        expect(cast(caster, 'blink', { ...context, now: 9000 })).toMatchObject([
            { kind: 'notice' },
        ])
        expect(caster.mana).toBe(60)
        expect(caster.abilities.availableAt.blink).toBe(9000)
    })
})

describe('Arcane projectile', () => {
    it('travels after the windup, impacts the first character and rolls once across all sides', () => {
        const { caster, ally, enemy, context } = encounter(() => 0.5)
        ally.position.x = 150
        enemy.position.x = 210
        expect(cast(caster, 'fireball', context, enemy.id)).toMatchObject([
            { kind: 'attack' },
        ])
        expect(caster.snapshot(start).animation).toMatchObject({
            pose: 'prepare',
            hitAt: 1400,
        })
        expect(resolveTestSpells(caster, context, 1399)).toEqual([])
        expect(resolveTestSpells(caster, context, 1450)).toEqual([])
        expect(
            magicCombatFor(caster)?.effectsFor(caster.locationId, 1450)
        ).toMatchObject([{ phase: 'flight', position: { x: 116, y: 100 } }])
        const events = resolveTestSpells(caster, context, 1550)
        expect(events.filter((event) => event.kind === 'damage')).toMatchObject(
            [
                { targetId: caster.id, amount: 25 },
                { targetId: ally.id, amount: 25 },
            ]
        )
        expect(enemy.hp).toBe(enemy.maxHp)
        expect(caster.progression.masteries.magic.experience).toBe(0n)
        expect(
            magicCombatFor(caster)?.effectsFor(caster.locationId, 1550)
        ).toMatchObject([{ phase: 'impact', radius: 64, expiresAt: 1850 }])
        expect(resolveTestSpells(caster, context, 1600)).toEqual([])
        expect(
            cast(caster, 'greater_fireball', { ...context, now: 5999 })
        ).toMatchObject([{ kind: 'notice' }])
        expect(
            cast(caster, 'greater_fireball', { ...context, now: 6000 })
        ).toMatchObject([{ kind: 'attack' }])
        expect(caster.snapshot(6000).animation).toMatchObject({
            pose: 'prepare',
        })
    })

    it('hits enemies and allies in line of sight, honors walls, and grants one mastery reward', () => {
        const { caster, ally, enemy, context } = encounter()
        caster.position.x = 40
        ally.position = { x: 110, y: 105 }
        enemy.position = { x: 115, y: 120 }
        const second = abilityHero('arcanist')
        Object.assign(second, { faction: 'monsters' })
        second.position = { x: 114, y: 130 }
        const covered = abilityHero('arcanist')
        covered.position = { x: 150, y: 100 }
        const battle = {
            ...context,
            characters: [...context.characters, second, covered],
        }
        for (let y = 0; y < 32; y += 1) {
            context.navigation.grid.solid[y * 32 + 8] = true
        }
        cast(caster, 'fireball', battle)
        const events = resolveTestSpells(caster, battle)
        expect(
            events
                .filter((event) => event.kind === 'damage')
                .map((event) => event.targetId)
        ).toEqual([ally.id, enemy.id, second.id])
        expect(caster.progression.masteries.magic.experience).toBe(48_000_000n)
        expect(covered.hp).toBe(covered.maxHp)
    })
})
