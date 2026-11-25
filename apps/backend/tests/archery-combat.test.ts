import { describe, expect, it } from 'vitest'

import { parseAbilityCommand } from '../src/game/abilityCommands'
import { GameCharacter } from '../src/game/character'
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
        expect(actor.snapshot(1000).animation).toMatchObject({
            pose: 'prepare',
            hitAt: 1700,
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
        expect(actor.snapshot(1500).animation).toMatchObject({ action: 'idle' })
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
    it('finishes a stationary aim before releasing or resuming held movement, even on a late tick', () => {
        const { actor, target, at, walk } = archerDuel()
        target.position = { x: 100, y: 145 }
        actor.setMoveInput({ x: 1, y: 0 })
        const [start] = attemptAbilityAttack(at(1000), 'shot')
        expect(start).toMatchObject({ phase: 'started', durationMs: 200 })
        expect(start?.projectile).toBeUndefined()
        walk(1050, 50)
        expect(actor.position.x).toBe(100)
        expect(resolvePendingAttackHit(at(1199))).toEqual([])
        walk(1250, 50)
        expect(actor.position.x).toBe(100)
        const release = resolvePendingAttackHit(at(1250))
        expect(release[0]).toMatchObject({
            actionId: start?.actionId,
            phase: 'completed',
            projectile: {
                origin: { x: 100, y: 100 },
                endpoint: target.position,
            },
        })
        expect(damage(release)).toBeGreaterThan(0)
        walk(1300, 50)
        expect(actor.position.x).toBeGreaterThan(100)
    })

    it('reports interrupted aim without a projectile, damage or refund when stunned', () => {
        const { actor, at } = archerDuel()
        const energy = actor.energy
        const [start] = attemptAbilityAttack(at(1000), 'shot')
        actor.stunUntil = 1300
        expect(resolvePendingAttackHit(at(1200))).toEqual([
            expect.objectContaining({
                kind: 'attack',
                phase: 'interrupted',
                abilityId: 'shot',
                actionId: start?.actionId,
            }),
        ])
        expect(actor.energy).toBe(energy - 10)
        expect(actor.abilities.availableAt.shot).toBe(1550)
    })

    it('keeps the paid attack cycle and shoots from the moved position along the original facing', () => {
        const { actor, target, at, stars, walk } = archerDuel()
        target.position = { x: 100, y: 145 }
        stars('moving_shot')
        actor.setMoveInput({ x: 1, y: 0 })
        const [start] = attemptAbilityAttack(at(1000), 'shot')
        expect(start).toMatchObject({ phase: 'started', durationMs: 200 })
        expect(start?.projectile).toBeUndefined()
        expect(actor.combat.readyAt).toBe(1200)
        const paidEnergy = actor.energy
        expect(handleMovementCommand(actor, { type: 'dash' }, 1050)).toEqual([])
        expect(actor.energy).toBe(paidEnergy)
        walk(1050, 50)
        expect(actor.position.x).toBeCloseTo(
            100 + effectiveMoveSpeed(actor) * 0.05
        )
        expect(actor.facing).toBe('right')
        expect(resolvePendingAttackHit(at(1199))).toEqual([])
        const events = resolvePendingAttackHit(at(1200))
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
        resolvePendingAttackHit(at(1200))
        expect(actor.movement.dashAvailableAt).toBe(3000)
        expect(actor.combat.arrowStep).toBeUndefined()

        handleMovementCommand(
            actor,
            { type: 'movement_mode', mode: 'sneaking' },
            1500
        )
        actor.setMoveInput({ x: 0, y: -1 })
        const position = { ...actor.position }
        expect(attemptAbilityAttack(at(1550), 'shot')[0]?.phase).toBe('started')
        walk(1760, 50)
        expect(actor.position).toEqual(position)
        resolvePendingAttackHit(at(1760))
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
    it.each([
        { elapsed: 3000, sameTarget: true, amount: 8 },
        { elapsed: 3001, sameTarget: true, amount: 7 },
        { elapsed: 3000, sameTarget: false, amount: 7 },
    ])(
        'checks the series window at impact ($elapsed ms, same target: $sameTarget)',
        ({ elapsed, sameTarget, amount }) => {
            const { actor, target, at, stars } = archerDuel()
            stars('damage1', 'damage2', 'series1')
            attemptAbilityAttack(at(1000), 'shot')
            expect(damage(resolvePendingAttackHit(at(1200)))).toBe(7)

            const next = sameTarget
                ? target
                : new GameCharacter({
                      id: 'other-foe',
                      nickname: 'Другой противник',
                      archetype: 'human',
                      heroClass: 'vanguard',
                      controllerKind: 'mob1',
                      faction: 'monsters',
                      spawnPosition: { ...target.position },
                  })
            next.config.combat.dodgeChance = 0
            next.reputation.peaceful = -100
            actor.energy = 100
            const attack = {
                ...at(1000 + elapsed),
                targetId: next.id,
                targets: [next],
            }
            expect(attemptAbilityAttack(attack, 'shot')).toHaveLength(1)
            expect(
                damage(
                    resolvePendingAttackHit({ ...attack, now: 1200 + elapsed })
                )
            ).toBe(amount)
        }
    )

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
        expect(damage(resolvePendingAttackHit(at(2800)))).toBe(8)
        expect(actor.movement.dashAvailableAt).toBe(3700)
        expect(actor.combat.arrowStep).toEqual({ until: 3400, multiplier: 1.1 })
        const position = actor.position.x
        walk(2850, 50)
        expect(actor.position.x - position).toBeCloseTo(
            effectiveMoveSpeed(actor) * 0.055
        )
    })

    it('consumes the quick hit series on a miss and never practices on a training target', () => {
        const { actor, target, at, stars } = archerDuel()
        stars('damage1', 'damage2', 'series1', 'series2')
        attemptAbilityAttack(at(1000), 'shot')
        expect(damage(resolvePendingAttackHit(at(1200)))).toBe(7)
        attemptAbilityAttack(at(1550), 'shot')
        expect(damage(resolvePendingAttackHit(at(1750)))).toBe(8)
        attemptAbilityAttack(at(2100), 'shot')
        target.position.y = 200
        expect(damage(resolvePendingAttackHit(at(2300)))).toBeUndefined()
        target.position.y = 112
        Object.assign(target, { trainingTarget: { areaId: 'range' } })
        const experience = actor.progression.masteries.arrow.experience
        attemptAbilityAttack(at(2650), 'shot')
        expect(damage(resolvePendingAttackHit(at(2850)))).toBe(7)
        expect(actor.progression.masteries.arrow.experience).toBe(experience)
        expect(actor.combat.lastUsefulArrowHit).toBeUndefined()
    })
})
