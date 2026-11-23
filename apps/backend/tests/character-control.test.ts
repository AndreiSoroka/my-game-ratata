import { describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import {
    advanceCharacterControl,
    cancelCharacterControl,
    parseControlCommand,
    rememberObservedCrossing,
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { grantRetaliation } from '../src/game/crimeRelations'
import { NavigationService } from '../src/game/navigation'
import { WorldInventory } from '../src/game/worldInventory'
import { chestHero, chestId, chestNavigation } from './chestTestHelpers'

function setup() {
    const navigation = new NavigationService({
        id: 'arena',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
        solidLayerNames: [],
    })
    const actor = make('hero', 64, 'peaceful')
    const target = make('enemy', 112, 'monsters')
    const ally = make('friend', 112, 'peaceful')
    const characters = [actor, target, ally]
    const requestAttack = vi.fn()
    return {
        actor,
        target,
        ally,
        navigation,
        characters,
        world: {
            getCharacter: (id: string) => characters.find((c) => c.id === id),
            navigationFor: () => navigation,
            requestAttack,
        },
    }
}
function make(id: string, x: number, faction: 'peaceful' | 'monsters') {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'network_player',
        faction,
        spawnPosition: { x, y: 64 },
    })
}

describe('shared automatic intentions', () => {
    it('approaches a selected enemy and uses exact shared attack reach', () => {
        const { actor, target, world } = setup()
        expect(
            setCharacterControl(
                actor,
                { type: 'auto_attack', targetId: target.id },
                world,
                1_000
            )
        ).toBe(true)
        advanceCharacterControl(actor, world, 1_000)
        expect(actor.hasPath()).toBe(true)
        expect(world.requestAttack).not.toHaveBeenCalled()
        target.position = { x: 74, y: 64 }
        advanceCharacterControl(actor, world, 1_350)
        expect(world.requestAttack).toHaveBeenCalledWith(
            actor,
            1_350,
            target.id
        )
        expect(actor.hasPath()).toBe(false)
        cancelCharacterControl(actor)
        expect(snapshotControl(actor)).toEqual({ mode: 'none', targetId: null })
    })
    it('follows a friend without taking control of that friend, then cancels on stun', () => {
        const { actor, ally, target, world } = setup()
        expect(
            setCharacterControl(
                actor,
                { type: 'follow', targetId: target.id },
                world,
                1_000
            )
        ).toBe(false)
        expect(
            setCharacterControl(
                actor,
                { type: 'follow', targetId: ally.id },
                world,
                1_000
            )
        ).toBe(true)
        advanceCharacterControl(actor, world, 1_000)
        expect(actor.hasPath()).toBe(true)
        expect(ally.hasPath()).toBe(false)
        actor.stunUntil = 1_700
        advanceCharacterControl(actor, world, 1_500)
        expect(snapshotControl(actor).mode).toBe('none')
        expect(actor.hasPath()).toBe(false)
    })
    it('never follows hidden live coordinates or an unobserved map crossing', () => {
        const { actor, ally, navigation, world } = setup()
        setCharacterControl(
            actor,
            { type: 'follow', targetId: ally.id },
            world,
            1_000
        )
        vi.spyOn(navigation, 'hasLineOfSight').mockReturnValue(false)
        ally.position.x = 250
        advanceCharacterControl(actor, world, 1_400)
        expect(actor.remainingPath().at(-1)?.x).toBeLessThan(150)
        ally.locationId = 'map-0-0'
        advanceCharacterControl(actor, world, 1_700)
        expect(snapshotControl(actor).mode).toBe('none')
    })
    it('rejects malformed commands and dead/offline targets', () => {
        const { actor, target, world } = setup()
        expect(
            parseControlCommand({ type: 'auto_attack', targetId: 3 })
        ).toBeUndefined()
        target.tags.add('offline')
        expect(
            setCharacterControl(
                actor,
                { type: 'auto_attack', targetId: target.id },
                world,
                1_000
            )
        ).toBe(false)
        expect(
            setCharacterControl(actor, { type: 'cancel_control' }, world, 1_000)
        ).toBe(true)
    })
})

describe('follow only records an observed location exit', () => {
    it.each([false, true])(
        'requires visibility in the current tick (sneaking: %s)',
        (sneaking) => {
            const { actor, ally, characters, world, navigation } = setup()
            actor.position.x = 100
            ally.position.x = 150
            expect(
                setCharacterControl(
                    actor,
                    { type: 'follow', targetId: ally.id },
                    world,
                    1_000
                )
            ).toBe(true)
            advanceCharacterControl(actor, world, 1_000)
            ally.position.x = 312
            if (sneaking) {
                ally.movement.mode = 'sneaking'
            }
            advanceCharacterControl(actor, world, 1_400)
            const from = ally.locationId
            const edge = { ...ally.position }
            ally.locationId = 'map-3-2'
            rememberObservedCrossing(
                ally,
                from,
                edge,
                { x: 1, y: 0 },
                characters,
                navigation,
                1_400
            )
            expect(advanceCharacterControl(actor, world, 1_400)).toBe(!sneaking)
            expect(snapshotControl(actor).mode).toBe(
                sneaking ? 'none' : 'follow'
            )
            if (sneaking) {
                expect(actor.hasPath()).toBe(false)
            } else {
                expect(actor.remainingPath().at(-1)?.x).toBe(312)
            }
        }
    )
})

describe('automatic attacks respect companion combat consent', () => {
    it('refuses an authored noncombatant even without an attached companion snapshot', () => {
        const { target, world } = setup()
        const actor = make('npc_magic_slime_1', 64, 'peaceful')
        expect(
            setCharacterControl(
                actor,
                { type: 'auto_attack', targetId: target.id },
                world,
                1_000
            )
        ).toBe(false)
        expect(snapshotControl(actor).mode).toBe('none')
        expect(world.requestAttack).not.toHaveBeenCalled()
    })

    it('refuses a custom noncombatant while still allowing that actor to follow friends', () => {
        const { actor, target, ally, world } = setup()
        actor.soul.companion = {
            canFight: false,
            lastReply: null,
            leaderId: null,
            order: 'idle',
        }
        expect(
            setCharacterControl(
                actor,
                { type: 'auto_attack', targetId: target.id },
                world,
                1_000
            )
        ).toBe(false)
        expect(
            setCharacterControl(
                actor,
                { type: 'follow', targetId: ally.id },
                world,
                1_000
            )
        ).toBe(true)
        expect(snapshotControl(actor).mode).toBe('follow')
    })

    it('cancels a running attack when the companion no longer permits fighting', () => {
        const { actor, target, world } = setup()
        actor.soul.companion = {
            canFight: true,
            lastReply: null,
            leaderId: null,
            order: 'idle',
        }
        expect(
            setCharacterControl(
                actor,
                { type: 'auto_attack', targetId: target.id },
                world,
                1_000
            )
        ).toBe(true)
        advanceCharacterControl(actor, world, 1_000)
        expect(actor.hasPath()).toBe(true)
        actor.soul.companion.canFight = false
        target.position.x = 70
        expect(advanceCharacterControl(actor, world, 1_350)).toBe(false)
        expect(snapshotControl(actor).mode).toBe('none')
        expect(actor.hasPath()).toBe(false)
        expect(world.requestAttack).not.toHaveBeenCalled()
    })
})

describe('targeted shared hits', () => {
    it('does not substitute a nearer neighbor during the windup', () => {
        const { actor, target, navigation } = setup()
        const neighbor = make('other', 68, 'monsters')
        target.position.x = 75
        const context = {
            actor,
            targets: [actor, target, neighbor],
            targetId: target.id,
            tileSize: 16,
            navigation,
            now: 1_000,
            random: () => 0.9,
            respawnDelayMsFor: () => 15_000,
        }
        expect(attemptAttack(context)[0]?.targetId).toBe(target.id)
        target.position.x = 180
        expect(resolvePendingAttackHit({ ...context, now: 1_100 })).toEqual([
            expect.objectContaining({
                kind: 'miss',
                hitQuality: 'miss',
                targetId: target.id,
            }),
        ])
        expect(neighbor.hp).toBe(neighbor.maxHp)
    })
    it('revalidates line of sight and applies actual dodge outcomes', () => {
        const { actor, target, navigation } = setup()
        target.position.x = 72
        const context = {
            actor,
            targets: [target],
            targetId: target.id,
            tileSize: 16,
            navigation,
            now: 1_000,
            random: () => 0,
            respawnDelayMsFor: () => 15_000,
        }
        const line = vi
            .spyOn(navigation, 'hasLineOfSight')
            .mockReturnValue(false)
        const energy = actor.energy
        expect(attemptAttack(context)).toEqual([])
        expect(actor.energy).toBe(energy)
        line.mockReturnValue(true)
        attemptAttack(context)
        expect(
            resolvePendingAttackHit({ ...context, now: 1_100 })
        ).toContainEqual(
            expect.objectContaining({ kind: 'miss', targetId: target.id })
        )
        expect(target.hp).toBe(target.maxHp)
    })
})

it.each(['dead', 'offline', 'retired', 'hostile'] as const)(
    'clears a running follow when its target becomes %s',
    (reason) => {
        const { actor, ally, world } = setup()
        setCharacterControl(
            actor,
            { type: 'follow', targetId: ally.id },
            world,
            1000
        )
        advanceCharacterControl(actor, world, 1000)
        expect(actor.hasPath()).toBe(true)
        if (reason === 'dead') {
            ally.applyDamage(ally.hp, 1100)
        }
        if (reason === 'offline') {
            ally.tags.add('offline')
        }
        if (reason === 'retired') {
            ally.tags.add('state.retired')
        }
        if (reason === 'hostile') {
            grantRetaliation(actor, ally, 5000)
        }
        expect(advanceCharacterControl(actor, world, 1400)).toBe(false)
        expect(snapshotControl(actor).mode).toBe('none')
        expect(actor.hasPath()).toBe(false)
    }
)

it('opening a shared chest cancels follow without a client-side stop command', () => {
    const navigation = chestNavigation()
    const actor = chestHero('viewer')
    const friend = chestHero('friend', { x: 140, y: 72 })
    const inventory = new WorldInventory(navigation)
    const world = {
        getCharacter: () => friend,
        navigationFor: () => navigation,
        requestAttack: () => undefined,
    }
    expect(
        setCharacterControl(
            actor,
            { type: 'follow', targetId: friend.id },
            world,
            1000
        )
    ).toBe(true)
    advanceCharacterControl(actor, world, 1000)
    inventory.openChestById(actor, chestId, 1000)
    expect(snapshotControl(actor).mode).toBe('none')
    expect(actor.hasPath()).toBe(false)
    expect(advanceCharacterControl(actor, world, 1400)).toBe(false)
})
