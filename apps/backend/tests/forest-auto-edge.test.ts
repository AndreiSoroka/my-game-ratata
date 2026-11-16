import {
    type AdventureResourceNode,
    type ClientMessage,
    type GameEventPayload,
    itemDurability,
} from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import {
    advanceCharacterControl,
    cancelCharacterControl,
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import type { ControlWorld } from '../src/game/controlWorld'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { applyPlayerMessage } from '../src/game/playerMessages'
import type { GameRoom } from '../src/game/room'
import { handleRoomControl } from '../src/game/roomControl'
import { WorldInventory } from '../src/game/worldInventory'

function character(id = 'worker', y = 224): GameCharacter {
    const actor = new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 184, y },
    })
    actor.equipment.weapon = createItemInstance('axe')
    return actor
}
function fixture(remaining = 8, source: 'tree' | 'bush' = 'tree') {
    const node: AdventureResourceNode = {
        id: 'selected',
        source,
        phase: 'ready',
        remaining,
        treeSize: 'adult',
        kind: source === 'tree' ? 'wood' : 'brushwood',
        locationId: 'map-2-2',
        position: { x: 184, y: 184 },
        bounds: { x: 160, y: 160, width: 48, height: 32 },
        matureBounds: { x: 160, y: 160, width: 48, height: 32 },
        collisionBounds: { x: 160, y: 160, width: 48, height: 32 },
    }
    const actor = character()
    const navigation = new NavigationService({
        id: actor.locationId,
        width: 40,
        height: 40,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(1600).fill(false),
        plantable: Array<boolean>(1600).fill(true),
        solidLayerNames: [],
    })
    const neighbor: AdventureResourceNode = {
        ...node,
        id: 'neighbor',
        position: { x: 264, y: 184 },
        bounds: { x: 240, y: 160, width: 48, height: 32 },
        matureBounds: { x: 240, y: 160, width: 48, height: 32 },
        collisionBounds: { x: 240, y: 160, width: 48, height: 32 },
        remaining: 8,
    }
    const service = new AdventureService({
        resourceNodes: [node, neighbor],
        worldObjects: [],
        now: () => 0,
    })
    const events: GameEventPayload[] = []
    const world: ControlWorld = {
        getCharacter: () => undefined,
        navigationFor: () => navigation,
        adventureForWorkers: () => service,
        publishEvents: (next) => {
            events.push(...next)
        },
        requestAttack: vi.fn(),
    }
    service.update(0, () => navigation, [actor])
    const start = (who = actor, now = 0) =>
        setCharacterControl(
            who,
            {
                type: 'auto_action',
                action: { kind: 'gather', nodeId: node.id },
            },
            world,
            now
        )
    const tick = (now: number, who = actor) =>
        advanceCharacterControl(who, world, now)
    const read = (id = node.id) =>
        service
            .resourceSnapshot(actor.locationId)
            .find((candidate) => candidate.id === id)
    const wall = () => {
        for (let x = 0; x < 40; x++) {
            navigation.grid.solid[13 * 40 + x] = true
        }
    }
    return {
        actor,
        navigation,
        service,
        world,
        events,
        start,
        tick,
        read,
        wall,
    }
}

it('stops immediately when a bush tool breaks without automatically switching to hand gathering', () => {
    const f = fixture(2, 'bush')
    const tool = f.actor.equipment.weapon
    if (tool === undefined) {
        throw new Error('Missing tool')
    }
    tool.durability = 1
    expect(f.start()).toBe(true)
    f.tick(0)
    expect(countInventoryItem(f.actor.inventory, 'brushwood')).toBe(1)
    expect(itemDurability(tool)).toBe(0)
    expect(f.read()?.remaining).toBe(1)
    expect(snapshotControl(f.actor).mode).toBe('none')
    expect(f.actor.isActionLocked(1)).toBe(false)
    expect(f.service.workAvailableAt(f.actor)).toBe(400)
    f.tick(400)
    f.tick(2000)
    expect(f.read()?.remaining).toBe(1)
    // A separate explicit command may choose the ordinary hand-gathering fallback.
    expect(f.start(f.actor, 2000)).toBe(true)
    f.tick(2000)
    expect(countInventoryItem(f.actor.inventory, 'brushwood')).toBe(2)
})

it('ordinary manual movement cancels and immediately frees movement while preserving the strike cooldown', () => {
    const f = fixture()
    f.start()
    f.tick(0)
    const context = {
        player: f.actor,
        navigation: f.navigation,
        characters: new Map([[f.actor.id, f.actor]]),
        connections: new Map(),
        requestAttack: vi.fn(),
        sendEvents: vi.fn(),
        worldInventory: new WorldInventory(f.navigation),
    }
    applyPlayerMessage({
        ...context,
        message: { type: 'move_input', axis: { x: 0, y: 0 } },
    })
    expect(snapshotControl(f.actor).mode).toBe('action')
    applyPlayerMessage({
        ...context,
        message: { type: 'move_input', axis: { x: 1, y: 0 } },
    })
    expect(snapshotControl(f.actor).mode).toBe('none')
    expect(f.actor.isActionLocked(1)).toBe(false)
    expect(f.actor.getMoveInput()).toEqual({ x: 1, y: 0 })
    const x = f.actor.position.x
    advanceCharacter({
        character: f.actor,
        navigation: f.navigation,
        now: 10,
        deltaMs: 10,
    })
    expect(f.actor.position.x).toBeGreaterThan(x)
    expect(f.service.workAvailableAt(f.actor)).toBe(2000)
    expect(f.start(f.actor, 100)).toBe(true)
    f.tick(100)
    f.tick(1999)
    expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
    f.tick(2000)
    expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(2)
})

it('preserves an unrelated later action lock when canceling forest work', () => {
    const f = fixture()
    f.start()
    f.tick(0)
    f.actor.lockAction(100, 5000)
    cancelCharacterControl(f.actor)
    expect(f.actor.actionLockUntil).toBe(5100)
    expect(f.service.workAvailableAt(f.actor)).toBe(2000)
    expect(snapshotControl(f.actor).mode).toBe('none')
})

it('a rejected route preserves active forest work and its current cooldown', () => {
    const f = fixture()
    f.start()
    f.tick(0)
    for (let y = 0; y < 40; y++) {
        f.navigation.grid.solid[y * 40 + 20] = true
    }
    const before = structuredClone(snapshotControl(f.actor))
    const lock = f.actor.actionLockUntil
    const message = { type: 'move_to', target: { x: 560, y: 224 } } as const
    handleRoomControl(f.actor, message, f.world as GameRoom, 1)
    applyPlayerMessage({
        player: f.actor,
        navigation: f.navigation,
        message,
        characters: new Map([[f.actor.id, f.actor]]),
        connections: new Map(),
        requestAttack: vi.fn(),
        sendEvents: vi.fn(),
        worldInventory: new WorldInventory(f.navigation),
    })
    expect(snapshotControl(f.actor)).toEqual(before)
    expect(f.actor.actionLockUntil).toBe(lock)
    expect(f.service.workAvailableAt(f.actor)).toBe(2000)
    f.tick(2000)
    expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(2)
})

it('rejects a selected source behind a wall without paying costs or starting navigation', () => {
    const f = fixture()
    const energy = f.actor.energy
    f.wall()
    expect(f.start()).toBe(false)
    expect(f.actor.hasPath()).toBe(false)
    expect(f.actor.energy).toBe(energy)
    expect(f.actor.inventory).toEqual([])
    expect(f.read()?.remaining).toBe(8)
})

it('lost access interrupts immediately during cooldown instead of waiting or harvesting through a wall', () => {
    const f = fixture()
    f.start()
    f.tick(0)
    const energy = f.actor.energy
    f.wall()
    f.tick(100)
    expect(snapshotControl(f.actor).mode).toBe('none')
    expect(f.actor.isActionLocked(100)).toBe(false)
    expect(f.service.workAvailableAt(f.actor)).toBe(2000)
    f.tick(2000)
    expect(f.actor.energy).toBe(energy)
    expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
    expect(f.read()?.remaining).toBe(7)
})

it('a source taken by another actor while approaching stops the pinned intention and leaves neighbors alone', () => {
    const f = fixture(1)
    f.actor.position = { x: 184, y: 320 }
    expect(f.start()).toBe(true)
    f.tick(0)
    expect(f.actor.hasPath()).toBe(true)
    const other = character('competitor')
    expect(
        f.service.handleResult(
            other,
            { type: 'gather', nodeId: 'selected' },
            [],
            f.navigation,
            100
        ).accepted
    ).toBe(true)
    f.tick(100)
    expect(snapshotControl(f.actor).mode).toBe('none')
    expect(f.actor.hasPath()).toBe(false)
    expect(f.actor.inventory).toEqual([])
    expect(f.service.workAvailableAt(f.actor)).toBe(0)
    expect(f.read()?.phase).toBe('stump')
    expect(f.read('neighbor')?.remaining).toBe(8)
    f.tick(10000)
    expect(f.actor.inventory).toEqual([])
})

it('two automatic controllers contesting the last strike grant the complete harvest exactly once', () => {
    const f = fixture(1)
    const other = character('competitor')
    const otherEnergy = other.energy
    expect(f.start()).toBe(true)
    expect(f.start(other)).toBe(true)
    f.tick(0)
    f.tick(0, other)
    expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
    expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(2)
    expect(countInventoryItem(f.actor.inventory, 'brushwood')).toBe(1)
    expect(other.inventory).toEqual([])
    expect(other.energy).toBe(otherEnergy)
    expect(other.equipment.weapon?.durability).toBe(1000)
    expect(
        f.events.filter(
            (event) =>
                event.kind === 'resource_gather' && event.itemId === 'wood'
        )
    ).toHaveLength(1)
    expect(snapshotControl(f.actor).mode).toBe('none')
    expect(snapshotControl(other).mode).toBe('none')
    expect(f.read()?.phase).toBe('stump')
    expect(f.read('neighbor')?.remaining).toBe(8)
})

it('zero damage leaves continuous work running until an actual positive damage result interrupts it', () => {
    const f = fixture()
    f.start()
    f.tick(0)
    f.actor.applyDamage(0, 100)
    expect(snapshotControl(f.actor).mode).toBe('action')
    expect(f.actor.isActionLocked(100)).toBe(true)
    f.actor.applyDamage(1, 101)
    expect(snapshotControl(f.actor).mode).toBe('none')
    expect(f.actor.isActionLocked(101)).toBe(false)
    expect(f.service.workAvailableAt(f.actor)).toBe(2000)
    f.tick(2000)
    expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
})

it('duplicate planting confirmation for the same normalized tile does not reset the no-progress deadline', () => {
    const f = fixture()
    f.actor.inventory = [createItemInstance('sapling')]
    const request = (position: { x: number; y: number }, now: number) =>
        setCharacterControl(
            f.actor,
            { type: 'auto_action', action: { kind: 'plant_tree', position } },
            f.world,
            now
        )
    expect(request({ x: 440, y: 440 }, 0)).toBe(true)
    f.tick(0)
    expect(f.actor.hasPath()).toBe(true)
    expect(request({ x: 447, y: 447 }, 9000)).toBe(true)
    f.tick(10000)
    expect(snapshotControl(f.actor).mode).toBe('none')
    expect(f.actor.hasPath()).toBe(false)
    expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(1)
    expect(
        f.service
            .resourceSnapshot(f.actor.locationId)
            .some((node) => node.phase === 'growing')
    ).toBe(false)
})

it.each<ClientMessage>([
    { type: 'craft', recipeId: 'stone_axe' },
    { type: 'pickup_item' },
    { type: 'open_chest', chestId: 'observed' },
    {
        type: 'market_trade',
        npcId: 'merchant',
        requestId: 'quote',
        side: 'sell',
        itemId: 'brushwood',
        quantity: 1,
        expectedTotal: 1,
    },
])(
    'a new $type order interrupts forest work before it is resolved',
    (message) => {
        const f = fixture()
        f.start()
        advanceCharacterControl(f.actor, f.world, 0)
        expect(f.actor.isActionLocked(1)).toBe(true)
        handleRoomControl(f.actor, message, f.world as GameRoom, 1)
        expect(f.actor.isActionLocked(1)).toBe(false)
        expect(snapshotControl(f.actor).mode).toBe('none')
        advanceCharacterControl(f.actor, f.world, 5000)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
    }
)
