import type { ClientMessage, GameEventPayload } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { AdventureService } from '../src/game/adventure'
import { advanceRevive } from '../src/game/characterLife'
import { CompanionService } from '../src/game/companions'
import { PartyService } from '../src/game/parties'
import { applyPlayerMessage } from '../src/game/playerMessages'
import { handleRoomAction } from '../src/game/roomActions'
import { stopCharacterMovement } from '../src/game/roomIdentity'
import { TheftService } from '../src/game/theft'
import { WorldInventory } from '../src/game/worldInventory'
import { abilityContext, abilityHero } from './abilityTestHelpers'

afterEach(() => vi.useRealTimers())

function rescue() {
    const caster = abilityHero()
    const target = abilityHero()
    target.applyDamage(target.hp, 500)
    const context = abilityContext([caster, target])
    const command = {
        type: 'use_ability',
        abilityId: 'pray',
        intent: { mode: 'revive', targetId: target.id },
    } as const
    const start = () => handleAbilityCommand(caster, command, context)
    const finish = (now = 4000, roll = 0) =>
        advanceRevive(
            caster,
            () => target,
            now,
            () => roll,
            { ...context, now }
        )
    return { caster, target, context, command, start, finish }
}

it.each([
    'stun',
    'offline',
    'wall',
    'far',
    'target-offline',
    'target-retired',
    'mana',
    'knowledge',
] as const)(
    'revival interrupts on %s without spending mana or practice',
    (reason) => {
        const { caster, target, context, start, finish } = rescue()
        start()
        expect(caster.abilities.casting).not.toBeNull()
        if (reason === 'stun') {
            caster.stunUntil = 4500
        }
        if (reason === 'offline') {
            caster.tags.add('offline')
        }
        if (reason === 'wall') {
            target.position.x = 132
            context.navigation.grid.solid[6 * 32 + 7] = true
        }
        if (reason === 'far') {
            target.position.x += 49
        }
        if (reason === 'target-offline') {
            target.tags.add('offline')
        }
        if (reason === 'target-retired') {
            target.tags.add('state.retired')
        }
        if (reason === 'mana') {
            caster.mana = 19
        }
        if (reason === 'knowledge') {
            caster.abilities.known.delete('pray')
        }
        const mana = caster.mana
        expect(finish()).toContainEqual(
            expect.objectContaining({ kind: 'cast', phase: 'interrupted' })
        )
        expect(caster.mana).toBe(mana)
        expect(caster.progression.masteries.prayer.experience).toBe(0n)
        expect(caster.progression.masteries.prayer.level).toBe(0)
        expect(target.alive).toBe(false)
        expect(finish(4500)).toEqual([])
    }
)

it.each([0, 0.99])(
    'two rescuers resolve sequentially with the first roll %s and revive only once',
    (firstRoll) => {
        const { caster, target, context, command, start, finish } = rescue()
        const second = abilityHero()
        const both = { ...context, characters: [caster, second, target] }
        start()
        handleAbilityCommand(second, command, both)
        const events = [
            ...finish(4000, firstRoll),
            ...advanceRevive(
                second,
                () => target,
                4000,
                () => 0,
                { ...both, now: 4000 }
            ),
        ]
        expect(events.filter((event) => event.kind === 'revive')).toHaveLength(
            1
        )
        expect(target.alive).toBe(true)
        expect(caster.mana).toBe(100)
        expect(second.mana).toBe(firstRoll === 0 ? 120 : 100)
        expect(second.progression.masteries.prayer.level).toBe(
            firstRoll === 0 ? 0 : 2
        )
    }
)

it.each(['move_input', 'move_to'] as const)(
    'ordinary %s freely cancels the pending channel and emits one interruption',
    (type) => {
        vi.useFakeTimers()
        vi.setSystemTime(1500)
        const { caster, target, context, start, finish } = rescue()
        start()
        const events: GameEventPayload[] = []
        const message: ClientMessage =
            type === 'move_input'
                ? { type, axis: { x: 1, y: 0 } }
                : { type, target: { x: 120, y: 100 } }
        applyPlayerMessage({
            characters: new Map([
                [caster.id, caster],
                [target.id, target],
            ]),
            connections: new Map(),
            message,
            navigation: context.navigation,
            player: caster,
            requestAttack: () => undefined,
            sendEvents: (batch) => events.push(...batch),
            worldInventory: new WorldInventory(context.navigation),
        })
        expect(caster.abilities.casting).toBeNull()
        expect(caster.isActionLocked(1500)).toBe(false)
        expect(
            events.filter(
                (event) =>
                    event.kind === 'cast' && event.phase === 'interrupted'
            )
        ).toHaveLength(1)
        expect(finish()).toEqual([])
        expect(caster.mana).toBe(120)
        expect(target.alive).toBe(false)
    }
)

it('disconnect cleanup cancels resurrection before a reconnect can reuse its channel', () => {
    const { caster, target, start, finish } = rescue()
    start()
    expect(stopCharacterMovement(caster, 1500)).toContainEqual(
        expect.objectContaining({ kind: 'cast', phase: 'interrupted' })
    )
    expect(stopCharacterMovement(caster, 1500)).toEqual([])
    expect(finish()).toEqual([])
    expect(caster.mana).toBe(120)
    expect(target.alive).toBe(false)
})

it('legacy revive shares prayer cooldown and cannot start until the normal boundary', () => {
    const { caster, target, context } = rescue()
    caster.progression.prayerAvailableAt = 4000
    caster.abilities.availableAt.pray = 4000
    const action = (now: number) =>
        handleRoomAction({
            player: caster,
            message: { type: 'revive', targetId: target.id },
            characters: [caster, target],
            allCharacters: [caster, target],
            navigation: context.navigation,
            now,
            theft: new TheftService(),
            adventure: new AdventureService(),
            parties: new PartyService(),
            companions: new CompanionService(),
            inventory: new WorldInventory(context.navigation),
        })
    expect(action(3999)).toContainEqual(
        expect.objectContaining({ kind: 'notice' })
    )
    expect(caster.abilities.casting).toBeNull()
    expect(action(4000)).toContainEqual(
        expect.objectContaining({ kind: 'cast', phase: 'started' })
    )
    expect(caster.abilities.casting?.targetId).toBe(target.id)
    expect(caster.mana).toBe(120)
})

it('resurrection of a victim killed only by friendly damage grants no practice', () => {
    const caster = abilityHero()
    const ally = abilityHero()
    const victim = abilityHero()
    resolveCharacterDamage({
        actor: ally,
        target: victim,
        amount: victim.hp,
        now: 500,
        damageKind: 'holy',
        respawnDelayMs: 15000,
    })
    const context = abilityContext([caster, ally, victim])
    handleAbilityCommand(
        caster,
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'revive', targetId: victim.id },
        },
        context
    )
    advanceRevive(
        caster,
        () => victim,
        4000,
        () => 0,
        { ...context, now: 4000 }
    )
    expect(victim.alive).toBe(true)
    expect(caster.mana).toBe(100)
    expect(caster.progression.masteries.prayer.experience).toBe(0n)
    expect(caster.progression.masteries.prayer.level).toBe(0)
})
