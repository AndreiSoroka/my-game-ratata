import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { executeContainerCommand } from '../src/game/containerCommands'
import { parseClientMessage } from '../src/game/messages'
import { NavigationService } from '../src/game/navigation'
import { WorldInventory } from '../src/game/worldInventory'
import { type WorldObjectDefinition } from '../src/game/worldObjectData'

function fixture(kind: WorldObjectDefinition['kind'] = 'barrel') {
    const clock = { now: 1000 }
    const object: WorldObjectDefinition = {
        id: 'test-object',
        name: 'Общие припасы',
        text: 'Текст таблички',
        kind,
        locationId: CENTER_LOCATION_ID,
        bounds: { x: 64, y: 64, width: 16, height: 16 },
    }
    const navigation = new NavigationService({
        id: 'test',
        width: 12,
        height: 12,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: ['solid'],
        solid: Array<boolean>(144).fill(false),
    })
    navigation.grid.solid[4 * 12 + 4] =
        kind !== 'sign' && kind !== 'quest_board'
    navigation.grid.containers =
        kind === 'barrel'
            ? [
                  {
                      id: object.id,
                      kind: 'barrel',
                      title: object.name,
                      propId: 'test-prop',
                      bounds: object.bounds,
                      contents: [
                          { itemId: 'wood', quantity: 1 },
                          { itemId: 'fiber', quantity: 1 },
                      ],
                  },
              ]
            : []
    const inventory = new WorldInventory(navigation, CENTER_LOCATION_ID)
    const actor = new GameCharacter({
        id: 'first',
        nickname: 'Первый',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 72, y: 88 },
    })
    const service = new AdventureService({
        now: () => clock.now,
        worldObjects: [object],
        resourceNodes: [],
        openContainer: (who, id, now) =>
            executeContainerCommand(
                inventory.containers,
                who,
                { type: 'open_chest', chestId: id },
                now
            ),
    })
    const act = (who = actor, id = object.id) =>
        service.handle(
            who,
            { type: 'world_interact', objectId: id },
            [],
            navigation
        )
    return { clock, actor, object, service, navigation, act, inventory }
}

it('reads the quest board only within reach and closes it on loss of sight', () => {
    const { actor, act, service, object, navigation, clock } =
        fixture('quest_board')
    const near = { ...actor.position }
    actor.position = { x: 168, y: 168 }
    act()
    expect(
        service.snapshot(actor.id, actor.locationId, actor).dialogue
    ).toBeNull()

    actor.position = near
    act()
    expect(
        service.snapshot(actor.id, actor.locationId, actor).dialogue
    ).toMatchObject({
        kind: 'quest_board',
        npcId: object.id,
        canTrade: false,
        choices: [{ id: 'leave', label: 'Закрыть' }],
    })
    expect(
        service.canReadQuestBoard(actor, object.id, navigation, clock.now)
    ).toBe(true)

    const sight = vi.spyOn(navigation, 'hasLineOfSight').mockReturnValue(false)
    try {
        expect(
            service.canReadQuestBoard(actor, object.id, navigation, clock.now)
        ).toBe(false)
        expect(
            service.reconcileConversations([actor], () => navigation).size
        ).toBe(0)
        expect(
            service.snapshot(actor.id, actor.locationId, actor).dialogue
        ).toBeNull()
    } finally {
        sight.mockRestore()
    }
})

describe('authored world objects', () => {
    it('reads a sign from its tile and closes through ordinary dialogue choice', () => {
        const { actor, act, service } = fixture('sign')
        actor.position = { x: 72, y: 72 }
        act()
        expect(
            service.snapshot(actor.id, actor.locationId, actor).dialogue
        ).toMatchObject({
            title: 'Общие припасы',
            text: 'Текст таблички',
            canTrade: false,
            choices: [{ id: 'leave', label: 'Закрыть' }],
        })
        service.handle(
            actor,
            { type: 'dialogue_choice', choiceId: 'leave' },
            []
        )
        expect(
            service.snapshot(actor.id, actor.locationId, actor).dialogue
        ).toBeNull()
    })

    it('shares barrel contents exactly once across controllers, retries and fresh identities', () => {
        const { actor, act, service, inventory, object } = fixture()
        const other = new GameCharacter({
            id: 'scripted',
            nickname: 'Страж',
            archetype: 'human',
            controllerKind: 'scripted',
            spawnPosition: actor.position,
        })
        act()
        inventory.containers.handle(
            actor,
            { type: 'take_all_chest_items', chestId: object.id },
            1000
        )
        act()
        act(other)
        expect(
            service.snapshot(actor.id, actor.locationId, actor).materials
        ).toMatchObject({
            wood: 1,
            fiber: 1,
        })
        expect(
            service.snapshot(other.id, other.locationId, other).materials
        ).toMatchObject({
            wood: 0,
            fiber: 0,
        })
        expect(inventory.containers.snapshot(actor, 1000)?.items).toEqual([])
        expect(
            service.snapshot(actor.id, actor.locationId, actor).worldObjects
        ).toEqual([])
        service.observe([retireCharacter(actor)], () => actor)
        act()
        expect(
            service.snapshot(actor.id, actor.locationId, actor).materials.wood
        ).toBe(0)
        expect(service.snapshot(actor.id, 'map-1-1').worldObjects).toEqual([])
    })

    it('drinks beside a solid trough with a shared cooldown and energy cap, without healing HP', () => {
        const { actor, act, service, clock } = fixture('water')
        actor.energy = 20
        actor.hp = 1
        act()
        expect(actor.energy).toBe(35)
        expect(actor.hp).toBe(1)
        act()
        expect(actor.energy).toBe(35)
        clock.now += 5000
        actor.energy = actor.config.resources.maxEnergy - 2
        act()
        expect(actor.energy).toBe(actor.config.resources.maxEnergy)
        expect(service.snapshot(actor.id, actor.locationId, actor).notice).toBe(
            'Прохладная вода освежает. Силы восстановлены.'
        )
    })
})

describe('world object validation', () => {
    it.each([
        'dead',
        'offline',
        'stunned',
        'locked',
        'remote',
        'other-location',
        'wall',
        'unknown',
    ])('rejects %s interaction without granting contents', (reason) => {
        const { actor, navigation, act, service, inventory } = fixture()
        if (reason === 'dead') {
            actor.alive = false
        }
        if (reason === 'offline') {
            actor.tags.add('offline')
        }
        if (reason === 'stunned') {
            actor.stunUntil = 2000
        }
        if (reason === 'locked') {
            actor.lockAction(1000, 1000)
        }
        if (reason === 'remote') {
            actor.position = { x: 184, y: 184 }
        }
        if (reason === 'other-location') {
            actor.locationId = 'map-1-1'
        }
        if (reason === 'wall') {
            actor.position = { x: 72, y: 120 }
            for (let x = 0; x < 12; x += 1) {
                navigation.grid.solid[6 * 12 + x] = true
            }
        }
        act(actor, reason === 'unknown' ? 'invented' : 'test-object')
        expect(
            service.snapshot(actor.id, actor.locationId, actor).materials.wood
        ).toBe(0)
        expect(
            inventory
                .snapshotChests()
                .find((chest) => chest.id === 'test-object')?.itemCount
        ).toBe(2)
    })

    it('provides detached snapshots and validates input without trusting rewards/owner', () => {
        const { actor, service } = fixture('sign')
        const snapshot = service.snapshot(actor.id, actor.locationId, actor)
        const object = snapshot.worldObjects?.[0]
        if (object === undefined) {
            throw new Error('Missing world object')
        }
        object.bounds.x = -100
        expect(
            service.snapshot(actor.id, actor.locationId, actor)
                .worldObjects?.[0]?.bounds.x
        ).toBe(64)
        expect(
            parseClientMessage(
                JSON.stringify({
                    type: 'world_interact',
                    objectId: 'test-object',
                    actorId: 'other',
                    reward: 1000,
                })
            )
        ).toEqual({
            message: { type: 'world_interact', objectId: 'test-object' },
        })
        for (const objectId of ['', ' ', 3, 'x'.repeat(101)]) {
            expect(
                parseClientMessage(
                    JSON.stringify({ type: 'world_interact', objectId })
                ).error
            ).toBeDefined()
        }
    })
})
