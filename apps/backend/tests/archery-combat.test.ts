import { describe, expect, it } from 'vitest'

import { parseAbilityCommand } from '../src/game/abilityCommands'
import {
    attemptAbilityAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { cancelSniperAimForMovement } from '../src/game/combatArchery'
import { effectiveMoveSpeed } from '../src/game/effectiveParameters'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import { NavigationService } from '../src/game/navigation'
import { bladeDuel } from './bladeCombatFixture'

function archerDuel() {
    const duel = bladeDuel('ranger')
    duel.actor.abilities.known.add('sniper_shot')
    return {
        ...duel,
        stars: (...stars: string[]) =>
            stars.forEach((star) =>
                duel.actor.progression.constellations.opened.add(
                    `arrow.${star}`
                )
            ),
        walk: (now: number, deltaMs: number) =>
            advanceCharacter({
                character: duel.actor,
                navigation: duel.navigation,
                now,
                deltaMs,
            }),
    }
}

function damage(actorEvents: ReturnType<typeof resolvePendingAttackHit>) {
    return actorEvents.find((event) => event.kind === 'damage')?.amount
}

it('requires an explicit character target in the shared command parser', () => {
    const command = { type: 'use_ability', abilityId: 'sniper_shot' }
    expect(parseAbilityCommand(command)).toBeUndefined()
    expect(
        parseAbilityCommand({
            ...command,
            target: { kind: 'grave', id: 'grave' },
        })
    ).toBeUndefined()
    expect(parseAbilityCommand({ ...command, targetId: 'foe' })).toEqual({
        ...command,
        targetId: 'foe',
    })
})

describe('archery targeting and action phases', () => {
    it('validates the diagonal range at start and releases the same paid action once', () => {
        const { actor, target, at } = archerDuel()
        const energy = actor.energy
        target.position = { x: 197, y: 228 }
        expect(attemptAbilityAttack(at(1000), 'sniper_shot')).toEqual([])
        expect(actor.energy).toBe(energy)
        target.position = { x: 196, y: 228 }
        const [start] = attemptAbilityAttack(at(1000), 'sniper_shot')
        expect(start).toMatchObject({
            phase: 'started',
            durationMs: 700,
            delivery: 'ranged_physical',
            attackGeometry: { kind: 'circle', radius: 160 },
        })
        expect(actor.energy).toBe(energy - 20)
        expect(actor.combat.readyAt).toBe(2800)
        expect(resolvePendingAttackHit(at(1699))).toEqual([])
        const events = resolvePendingAttackHit(at(1700))
        expect(events[0]).toMatchObject({
            actionId: start?.actionId,
            phase: 'completed',
            projectile: {
                origin: { x: 100, y: 100 },
                endpoint: target.position,
            },
        })
        expect(damage(events)).toBe(13)
        expect(actor.progression.masteries.arrow.experience).toBeGreaterThan(0n)
        expect(resolvePendingAttackHit(at(1700))).toEqual([])
        expect(
            attemptAbilityAttack({ ...at(2799), targetId: undefined }, 'shot')
        ).toEqual([])
        expect(
            attemptAbilityAttack({ ...at(2800), targetId: undefined }, 'shot')
        ).toHaveLength(1)
    })

    it('lets movement interrupt aim while preserving payment and both deadlines', () => {
        const { actor, at, walk } = archerDuel()
        const energy = actor.energy
        actor.setMoveInput({ x: 1, y: 0 })
        expect(attemptAbilityAttack(at(1000), 'sniper_shot')).toHaveLength(1)
        expect(actor.getMoveInput()).toEqual({ x: 0, y: 0 })
        expect(cancelSniperAimForMovement(actor, { x: 0, y: 0 }, 1500)).toEqual(
            []
        )
        expect(
            cancelSniperAimForMovement(actor, { x: 1, y: 0 }, 1500)
        ).toMatchObject([
            { phase: 'interrupted', kind: 'attack', abilityId: 'sniper_shot' },
        ])
        expect(actor.energy).toBe(energy - 20)
        expect(actor.combat.readyAt).toBe(2800)
        expect(actor.abilities.availableAt.sniper_shot).toBe(2800)
        actor.setMoveInput({ x: 1, y: 0 })
        walk(1550, 50)
        expect(actor.position.x).toBeGreaterThan(100)
        expect(resolvePendingAttackHit(at(1700))).toEqual([])
        expect(actor.progression.masteries.arrow.experience).toBe(0n)
    })

    it('misses a newly concealed target without reporting its new position', () => {
        const { actor, target, at } = archerDuel()
        target.position = { x: 196, y: 228 }
        target.movement.mode = 'sneaking'
        expect(attemptAbilityAttack(at(1000), 'sniper_shot')).toEqual([])
        target.movement.mode = 'walking'
        expect(attemptAbilityAttack(at(1000), 'sniper_shot')).toHaveLength(1)
        target.movement.mode = 'sneaking'
        target.position = { x: 190, y: 230 }
        const events = resolvePendingAttackHit(at(1700))
        expect(events[0]).toMatchObject({
            phase: 'completed',
            projectile: { endpoint: { x: 196, y: 228 } },
        })
        expect(events[0]?.targetId).toBeUndefined()
        expect(events[1]).toMatchObject({ kind: 'miss' })
        expect(actor.progression.masteries.arrow.experience).toBe(0n)
    })

    it.each(['wall', 'travel', 'dodge'] as const)(
        'revalidates %s on release',
        (condition) => {
            const { actor, target, at, navigation } = archerDuel()
            target.position = { x: 100, y: 190 }
            expect(attemptAbilityAttack(at(1000), 'sniper_shot')).toHaveLength(
                1
            )
            if (condition === 'wall') {
                navigation.grid.solid[9 * 32 + 6] = true
            } else if (condition === 'travel') {
                target.locationId = 'map-0-0'
            } else {
                target.config.combat.dodgeChance = 0.5
            }
            const events = resolvePendingAttackHit({
                ...at(1700),
                random: () => 0,
            })
            expect(events).toContainEqual(
                expect.objectContaining({ kind: 'miss' })
            )
            expect(damage(events)).toBeUndefined()
            expect(actor.progression.masteries.arrow.experience).toBe(0n)
            if (condition === 'wall') {
                expect(events[0]?.projectile?.endpoint.y).toBeLessThan(144)
            }
        }
    )
})

describe('quick shot movement and learned effects', () => {
    it('keeps the paid attack cycle and shoots from the moved position along the original facing', () => {
        const { actor, target, at, stars, walk } = archerDuel()
        target.position = { x: 100, y: 145 }
        actor.setMoveInput({ x: 1, y: 0 })
        attemptAbilityAttack(at(1000), 'shot')
        walk(1050, 50)
        expect(actor.position.x).toBe(100)
        resolvePendingAttackHit(at(1050))

        stars('moving_shot')
        const [start] = attemptAbilityAttack(at(1550), 'shot')
        expect(start).toMatchObject({ phase: 'started', durationMs: 50 })
        expect(actor.combat.readyAt).toBe(1750)
        walk(1600, 50)
        expect(actor.position.x).toBeCloseTo(
            100 + effectiveMoveSpeed(actor) * 0.05
        )
        expect(actor.facing).toBe('right')
        const events = resolvePendingAttackHit(at(1600))
        expect(events[0]).toMatchObject({
            phase: 'completed',
            projectile: {
                origin: actor.position,
                endpoint: { x: actor.position.x, y: target.position.y },
            },
        })
        expect(damage(events)).toBeGreaterThan(0)
    })

    it('does not count wall pressure or sneaking as walking and rejects both shots during a dash', () => {
        const { actor, target, at, stars, navigation, walk } = archerDuel()
        stars('moving_shot', 'moving_dash1', 'moving_speed1')
        const wall = new NavigationService({
            ...navigation.grid,
            solid: navigation.grid.solid.map(
                (tile, index) => tile || index % 32 === 7
            ),
        })
        actor.position.x = 111
        target.position.x = 111
        actor.movement.dashAvailableAt = 3000
        actor.setMoveInput({ x: 1, y: 0 })
        attemptAbilityAttack(at(1000), 'shot')
        advanceCharacter({
            character: actor,
            navigation: wall,
            now: 1050,
            deltaMs: 50,
        })
        expect(actor.position.x).toBe(111)
        resolvePendingAttackHit(at(1050))
        expect(actor.movement.dashAvailableAt).toBe(3000)
        expect(actor.combat.arrowStep).toBeUndefined()

        handleMovementCommand(
            actor,
            { type: 'movement_mode', mode: 'sneaking' },
            1500
        )
        expect(attemptAbilityAttack(at(1550), 'shot')[0]?.phase).toBeUndefined()
        walk(1600, 50)
        expect(actor.position.x).toBe(111)
        resolvePendingAttackHit(at(1600))
        actor.setMoveInput({ x: 0, y: 0 })
        expect(
            handleMovementCommand(actor, { type: 'dash' }, 3000)
        ).toContainEqual({
            kind: 'dash',
            actorId: actor.id,
        })
        const energy = actor.energy
        expect(attemptAbilityAttack(at(3001), 'shot')).toEqual([])
        expect(attemptAbilityAttack(at(3001), 'sniper_shot')).toEqual([])
        expect(actor.energy).toBe(energy)
    })
})

describe('archery specializations', () => {
    it('uses learned range, opener and moving follow-up bonuses on the next paid shot', () => {
        const { actor, target, at, stars, walk } = archerDuel()
        stars(
            'sniper_range1',
            'sniper_range2',
            'sniper_windup1',
            'sniper_windup2',
            'sniper_economy1',
            'sniper_economy2',
            'sniper_tempo1',
            'sniper_tempo2',
            'sniper_long_range',
            'sniper_opening',
            'moving_shot',
            'moving_damage1',
            'moving_damage2',
            'moving_followup1',
            'moving_followup2',
            'moving_dash1',
            'moving_dash2',
            'moving_speed1',
            'moving_speed2'
        )
        target.position.y = 292
        const energy = actor.energy
        const [start] = attemptAbilityAttack(at(1000), 'sniper_shot')
        expect(start).toMatchObject({
            durationMs: 550,
            attackGeometry: { radius: 192 },
        })
        expect(actor.energy).toBe(energy - 16)
        expect(actor.combat.readyAt).toBe(2600)
        expect(damage(resolvePendingAttackHit(at(1550)))).toBe(18)

        target.position.y = 145
        actor.movement.dashAvailableAt = 4000
        actor.setMoveInput({ x: 1, y: 0 })
        attemptAbilityAttack(at(2600), 'shot')
        walk(2650, 50)
        expect(damage(resolvePendingAttackHit(at(2650)))).toBe(8)
        expect(actor.movement.dashAvailableAt).toBe(3700)
        expect(actor.combat.arrowStep).toEqual({ until: 3250, multiplier: 1.1 })
        const position = actor.position.x
        walk(2700, 50)
        expect(actor.position.x - position).toBeCloseTo(
            effectiveMoveSpeed(actor) * 0.055
        )
    })

    it('consumes the quick hit series on a miss and never practices on a training target', () => {
        const { actor, target, at, stars } = archerDuel()
        stars('damage1', 'damage2', 'series1', 'series2')
        attemptAbilityAttack(at(1000), 'shot')
        expect(damage(resolvePendingAttackHit(at(1050)))).toBe(7)
        attemptAbilityAttack(at(1550), 'shot')
        expect(damage(resolvePendingAttackHit(at(1600)))).toBe(8)
        attemptAbilityAttack(at(2100), 'shot')
        target.position.y = 200
        expect(damage(resolvePendingAttackHit(at(2150)))).toBeUndefined()
        target.position.y = 112
        Object.assign(target, { trainingTarget: { areaId: 'range' } })
        const experience = actor.progression.masteries.arrow.experience
        attemptAbilityAttack(at(2650), 'shot')
        expect(damage(resolvePendingAttackHit(at(2700)))).toBe(7)
        expect(actor.progression.masteries.arrow.experience).toBe(experience)
        expect(actor.combat.lastUsefulArrowHit).toBeUndefined()
    })
})
