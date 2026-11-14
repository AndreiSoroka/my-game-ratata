import {
    ABILITY_DEFINITIONS,
    type CharacterAutoAction,
    type GameEventPayload,
    type HeroClass,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import type { GameCharacter } from '../src/game/character'
import {
    advanceCharacterControl,
    type ControlWorld,
    parseControlCommand,
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import { advanceRevive } from '../src/game/characterLife'
import { attemptAbilityAttack, attemptAttack } from '../src/game/combat'
import { grantRetaliation } from '../src/game/crimeRelations'
import { createItemInstance } from '../src/game/inventory'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function fixture(heroClass: HeroClass = 'cleric') {
    const actor = abilityHero(heroClass)
    const target = abilityHero('vanguard')
    target.position.x = 112
    const characters = [actor, target]
    const context = abilityContext(characters)
    const events: GameEventPayload[] = []
    const publishEvents = vi.fn((next: GameEventPayload[]) => {
        events.push(...next)
    })
    const attackContext = (
        attacker: GameCharacter,
        now: number,
        targetId?: string
    ) => ({
        actor: attacker,
        now,
        targetId,
        targets: characters,
        navigation: context.navigation,
        tileSize: 16,
        random: () => 0.9,
        respawnDelayMsFor: () => 15_000,
    })
    const world: ControlWorld = {
        getCharacter: (id) =>
            characters.find((character) => character.id === id),
        navigationFor: () => context.navigation,
        publishEvents,
        abilityContextFor: (_actor, now) => ({
            ...context,
            now,
            requestAbilityAttack: (attacker, id, ability, time) =>
                attemptAbilityAttack(
                    attackContext(attacker, time, id),
                    ability
                ),
        }),
        requestAttack: (attacker, now = 1000, id) => {
            publishEvents(attemptAttack(attackContext(attacker, now, id)))
        },
    }
    const enable = (action: CharacterAutoAction, now = 1000) =>
        setCharacterControl(actor, { type: 'auto_action', action }, world, now)
    const tick = (now: number) => advanceCharacterControl(actor, world, now)
    const hostile = () => grantRetaliation(actor, target, 60_000)
    return {
        actor,
        target,
        characters,
        context,
        world,
        events,
        publishEvents,
        enable,
        tick,
        hostile,
    }
}

describe('automatic action scheduling through shared rules', () => {
    it('enables without casting, waits silently for resources and honors the exact cooldown', () => {
        const f = fixture('arcanist')
        f.hostile()
        f.actor.mana = 0
        expect(
            f.enable({
                kind: 'ability',
                abilityId: 'spark',
                targetId: f.target.id,
            })
        ).toBe(true)
        expect(f.events).toEqual([])
        f.tick(1000)
        f.tick(1100)
        expect(snapshotControl(f.actor).waiting).toBe('resources')
        expect(f.events).toEqual([])
        f.actor.mana = 100
        f.tick(1200)
        expect(
            f.events.filter((event) => event.kind === 'attack')
        ).toHaveLength(1)
        expect(f.actor.mana).toBe(100 - ABILITY_DEFINITIONS.spark.mana)
        f.tick(1200 + ABILITY_DEFINITIONS.spark.cooldownMs - 1)
        expect(snapshotControl(f.actor).waiting).toBe('cooldown')
        expect(
            f.events.filter((event) => event.kind === 'attack')
        ).toHaveLength(1)
        f.tick(1200 + ABILITY_DEFINITIONS.spark.cooldownMs)
        expect(
            f.events.filter((event) => event.kind === 'attack')
        ).toHaveLength(2)
        expect(f.events.some((event) => event.kind === 'notice')).toBe(false)
    })
    it('waits for another authoritative action lock, then spends costs once', () => {
        const f = fixture('arcanist')
        f.hostile()
        f.actor.lockAction(1000, 400)
        expect(
            f.enable({
                kind: 'ability',
                abilityId: 'spark',
                targetId: f.target.id,
            })
        ).toBe(true)
        f.tick(1399)
        expect(snapshotControl(f.actor).waiting).toBe('action')
        expect(f.events).toEqual([])
        f.tick(1400)
        expect(
            f.events.filter((event) => event.kind === 'attack')
        ).toHaveLength(1)
    })
    it('approaches using navigation and stops at shared melee geometry rather than a generic radius', () => {
        const f = fixture('vanguard')
        f.hostile()
        f.target.position = { x: 148, y: 100 }
        expect(f.enable({ kind: 'attack', targetId: f.target.id })).toBe(true)
        f.tick(1000)
        expect(snapshotControl(f.actor).waiting).toBe('range')
        expect(f.actor.hasPath()).toBe(true)
        expect(f.events).toEqual([])
        f.target.position.x = 112
        f.tick(1350)
        expect(f.actor.hasPath()).toBe(false)
        expect(f.events).toContainEqual(
            expect.objectContaining({ kind: 'attack', targetId: f.target.id })
        )
    })
    it('keeps a deep copy of the exact command and stops on explicit cancellation', () => {
        const f = fixture('arcanist')
        f.hostile()
        const action = {
            kind: 'ability',
            abilityId: 'spark',
            targetId: f.target.id,
        } as const
        f.enable(action)
        const snapshot = snapshotControl(f.actor)
        if (snapshot.action?.kind !== 'ability') {
            throw new Error('Missing auto action')
        }
        snapshot.action.targetId = 'replacement'
        expect(snapshotControl(f.actor).targetId).toBe(f.target.id)
        expect(
            setCharacterControl(
                f.actor,
                { type: 'auto_action', action: null },
                f.world,
                1001
            )
        ).toBe(true)
        expect(snapshotControl(f.actor)).toEqual({
            mode: 'none',
            targetId: null,
        })
        f.tick(2000)
        expect(f.events).toEqual([])
    })
})

describe('automatic action authority and target loss', () => {
    it.each([
        'dead',
        'offline',
        'retired',
        'other-location',
        'hidden',
        'removed',
    ] as const)('stops instead of replacing a %s pinned target', (reason) => {
        const f = fixture('arcanist')
        f.hostile()
        f.enable({ kind: 'ability', abilityId: 'spark', targetId: f.target.id })
        if (reason === 'dead') {
            f.target.applyDamage(f.target.hp, 1001)
        }
        if (reason === 'offline') {
            f.target.tags.add('offline')
        }
        if (reason === 'retired') {
            f.target.tags.add('state.retired')
        }
        if (reason === 'other-location') {
            f.target.locationId = 'map-0-0'
        }
        if (reason === 'hidden') {
            vi.spyOn(f.context.navigation, 'hasLineOfSight').mockReturnValue(
                false
            )
        }
        if (reason === 'removed') {
            f.characters.splice(f.characters.indexOf(f.target), 1)
        }
        expect(f.tick(1100)).toBe(false)
        expect(snapshotControl(f.actor).mode).toBe('none')
        expect(f.actor.hasPath()).toBe(false)
        expect(f.events).toEqual([])
    })
    it.each(['dead', 'offline', 'retired', 'stunned', 'unknown'] as const)(
        'stops when the actor becomes %s without spending costs',
        (reason) => {
            const f = fixture('arcanist')
            f.hostile()
            f.enable({
                kind: 'ability',
                abilityId: 'spark',
                targetId: f.target.id,
            })
            if (reason === 'dead') {
                f.actor.applyDamage(f.actor.hp, 1001)
            }
            if (reason === 'offline') {
                f.actor.tags.add('offline')
            }
            if (reason === 'retired') {
                f.actor.tags.add('state.retired')
            }
            if (reason === 'stunned') {
                f.actor.stunUntil = 2000
            }
            if (reason === 'unknown') {
                f.actor.abilities.known.delete('spark')
            }
            const mana = f.actor.mana
            expect(f.tick(1100)).toBe(false)
            expect(snapshotControl(f.actor).mode).toBe('none')
            expect(f.actor.mana).toBe(mana)
            expect(f.events).toEqual([])
        }
    )
    it('rejects friendly combat and broken melee weapons before enabling', () => {
        const f = fixture('vanguard')
        expect(f.enable({ kind: 'attack', targetId: f.target.id })).toBe(false)
        f.hostile()
        f.actor.equipment.weapon = {
            ...createItemInstance('old_sword'),
            durability: 0,
        }
        expect(f.enable({ kind: 'attack', targetId: f.target.id })).toBe(false)
        expect(f.events).toEqual([])
    })
    it('rejects malformed action data and accepts only explicit pinned prayer intentions', () => {
        for (const action of [
            undefined,
            {},
            { kind: 'attack', targetId: ' ' },
            { kind: 'ability', abilityId: 'invented' },
            { kind: 'prayer', intent: { mode: 'restore' } },
            { kind: 'prayer', intent: { mode: 'devotion', targetId: 'other' } },
        ]) {
            expect(
                parseControlCommand({ type: 'auto_action', action })
            ).toBeUndefined()
        }
        expect(
            parseControlCommand({
                type: 'auto_action',
                action: {
                    kind: 'prayer',
                    intent: { mode: 'restore', targetId: 'ally' },
                },
            })
        ).toEqual({
            type: 'auto_action',
            action: {
                kind: 'prayer',
                intent: { mode: 'restore', targetId: 'ally' },
            },
        })
    })
})

describe('automatic prayer remains the pinned intention', () => {
    it('stops after the selected recipient is restored instead of changing to a wounded neighbor', () => {
        const f = fixture()
        f.target.hp -= 1
        const neighbor = abilityHero()
        neighbor.hp -= 10
        f.characters.push(neighbor)
        expect(
            f.enable({
                kind: 'prayer',
                intent: { mode: 'restore', targetId: f.target.id },
            })
        ).toBe(true)
        f.tick(1000)
        expect(f.target.hp).toBe(f.target.maxHp)
        expect(f.actor.mana).toBe(115)
        expect(f.tick(1001)).toBe(false)
        f.tick(5000)
        expect(neighbor.hp).toBe(neighbor.maxHp - 10)
        expect(f.events.filter((event) => event.kind === 'cast')).toHaveLength(
            1
        )
    })
    it('retries failed miracles only after cooldown while retaining the same recipient', () => {
        const f = fixture()
        f.context.random = () => 1
        f.target.hp -= 10
        f.enable({
            kind: 'prayer',
            intent: { mode: 'restore', targetId: f.target.id },
        })
        f.tick(1000)
        f.tick(3999)
        expect(f.events.filter((event) => event.kind === 'cast')).toHaveLength(
            1
        )
        expect(snapshotControl(f.actor).waiting).toBe('cooldown')
        f.tick(4000)
        expect(f.events.filter((event) => event.kind === 'cast')).toHaveLength(
            2
        )
        expect(f.actor.mana).toBe(110)
        expect(f.target.hp).toBe(f.target.maxHp - 10)
        expect(f.events.some((event) => event.kind === 'notice')).toBe(false)
    })
    it('keeps devotion cosmetic, free and untrained when new prayer targets appear', () => {
        const f = fixture()
        const random = vi.fn(() => 0)
        f.context.random = random
        f.actor.mana = 0
        f.enable({ kind: 'prayer', intent: { mode: 'devotion' } })
        f.target.hp -= 10
        for (const now of [1000, 4000, 7000]) {
            f.tick(now)
        }
        expect(f.events).toHaveLength(3)
        expect(f.events.every((event) => event.kind === 'cast')).toBe(true)
        expect(f.actor.mana).toBe(0)
        expect(f.target.hp).toBe(f.target.maxHp - 10)
        expect(f.actor.progression.skills.faith.practice).toBe(0)
        expect(f.actor.progression.skills.miracles.practice).toBe(0)
        expect(random).not.toHaveBeenCalled()
    })
    it('channels one revival through the shared life-cycle service and stops after resurrection', () => {
        const f = fixture()
        f.target.applyDamage(f.target.hp, 100)
        f.enable({
            kind: 'prayer',
            intent: { mode: 'revive', targetId: f.target.id },
        })
        f.tick(1000)
        f.tick(2000)
        expect(f.actor.mana).toBe(120)
        expect(f.events.filter((event) => event.kind === 'cast')).toHaveLength(
            1
        )
        const completed = advanceRevive(
            f.actor,
            (id) => f.world.getCharacter(id),
            4000,
            () => 0,
            { ...f.context, now: 4000 }
        )
        expect(completed).toContainEqual(
            expect.objectContaining({ kind: 'revive', targetId: f.target.id })
        )
        expect(f.actor.mana).toBe(100)
        expect(f.tick(4001)).toBe(false)
        expect(snapshotControl(f.actor).mode).toBe('none')
    })
})

it.each(['offline', 'expired', 'other-location'] as const)(
    'interrupts an automatic revival when the corpse becomes %s without spending mana',
    (reason) => {
        const f = fixture()
        f.target.applyDamage(f.target.hp, 100)
        f.enable({
            kind: 'prayer',
            intent: { mode: 'revive', targetId: f.target.id },
        })
        f.tick(1000)
        if (reason === 'offline') {
            f.target.tags.add('offline')
        }
        if (reason === 'expired') {
            f.target.reviveUntil = 1500
        }
        if (reason === 'other-location') {
            f.target.locationId = 'map-0-0'
        }
        expect(f.tick(2000)).toBe(false)
        const interrupted = advanceRevive(
            f.actor,
            (id) => f.world.getCharacter(id),
            2000,
            () => 0,
            { ...f.context, now: 2000 }
        )
        expect(interrupted).toContainEqual(
            expect.objectContaining({ kind: 'cast', phase: 'interrupted' })
        )
        expect(f.actor.abilities.casting).toBeNull()
        expect(f.actor.mana).toBe(120)
        expect(f.target.alive).toBe(false)
        expect(snapshotControl(f.actor).mode).toBe('none')
    }
)
