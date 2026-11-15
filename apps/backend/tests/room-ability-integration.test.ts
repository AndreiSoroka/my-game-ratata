import { afterEach, expect, it, vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { advanceRevive, beginRevive } from '../src/game/characterLife'
import { createItemInstance } from '../src/game/inventory'
import { PartyService } from '../src/game/parties'
import { publishRoomEvents } from '../src/game/roomEvents'
import { advanceRoomLives } from '../src/game/roomLifecycle'
import { WorldLocations } from '../src/game/worldLocations'
import { abilityContext, abilityHero } from './abilityTestHelpers'

afterEach(() => {
    vi.unstubAllGlobals()
})

it('routes an NPC prayer death through ordinary world rewards exactly once', () => {
    vi.stubGlobal('Bun', { env: {} })
    const actor = abilityHero('cleric', 'undead', 'scripted')
    actor.progression.patron = 'grave'
    actor.progression.skills.miracles.level = 3
    actor.progression.constellations.opened.add('prayer.harm')
    const target = new GameCharacter({
        id: 'slime-victim',
        archetype: 'slime',
        controllerKind: 'mob1',
        faction: 'monsters',
        nickname: 'Slime',
        spawnPosition: actor.position,
    })
    target.hp = 1
    const characters = new Map([
        [actor.id, actor],
        [target.id, target],
    ])
    const context = abilityContext([...characters.values()])
    const world = new WorldLocations(context.navigation)
    const inventory = world.get(actor.locationId).inventory
    const objects = () =>
        inventory.snapshotItems().length + inventory.snapshotChests().length
    const before = objects()
    handleAbilityCommand(
        actor,
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'harm', targetId: target.id },
        },
        context
    )
    const events = advanceRevive(
        actor,
        (id) => characters.get(id),
        4000,
        () => 0,
        { ...context, now: 4000 }
    )
    expect(events).toContainEqual(
        expect.objectContaining({ kind: 'death', targetId: target.id })
    )
    const adventure = new AdventureService()
    const parties = new PartyService(() => ({ ok: false, shares: [] }))
    for (let replay = 0; replay < 2; replay += 1) {
        publishRoomEvents(
            events,
            characters,
            adventure,
            parties,
            () => [],
            new Map(),
            world
        )
        expect(objects()).toBe(before + 1)
    }
})

it('rechecks line of sight through the room ability context while reviving', () => {
    const caster = abilityHero()
    const target = abilityHero()
    const item = createItemInstance('food')
    target.inventory.push(item)
    target.applyDamage(target.hp, 100)
    const characters = new Map([
        [caster.id, caster],
        [target.id, target],
    ])
    const context = abilityContext([...characters.values()])
    expect(beginRevive(caster, target, context.now, context)).toBe(true)
    const sight = vi
        .spyOn(context.navigation, 'hasLineOfSight')
        .mockReturnValue(false)
    try {
        advanceRoomLives({
            characters,
            connections: new Map(),
            controllers: new Map(),
            nicknames: new Map(),
            now: context.now + 3000,
            abilityContextFor: (_actor, now) => ({ ...context, now }),
            onEvents: () => undefined,
        })
        expect(caster.abilities.casting).toBeNull()
        expect(target.alive).toBe(false)
        expect(target.inventory).toEqual([item])
    } finally {
        sight.mockRestore()
    }
})
