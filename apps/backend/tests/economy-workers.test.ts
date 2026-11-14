import {
    type AdventureClientMessage,
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { EconomyWorkerController } from '../src/game/economyWorkers'
import {
    countInventoryItem,
    createItemInstance,
    equipDirect,
} from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'

it('a worker walks to a shared tree and merchant, delivering one real unit within its work budget', () => {
    const test = fixture()
    let moved = false
    for (let tick = 0; tick < 1000; tick += 1) {
        const before = { ...test.worker.position }
        test.tick()
        moved ||=
            Math.hypot(
                before.x - test.worker.position.x,
                before.y - test.worker.position.y
            ) > 0
    }
    expect(moved).toBe(true)
    expect(
        test.service.resourceSnapshot(CENTER_LOCATION_ID)[0]?.remaining
    ).toBe(7)
    expect(
        test.service.economy
            .snapshot(CENTER_LOCATION_ID, test.now())
            ?.rows.find((row) => row.itemId === 'wood')?.stock
    ).toBe(7)
    expect(countInventoryItem(test.worker.inventory, 'wood')).toBe(0)
    expect(test.service.snapshot(test.worker.id).gold).toBeGreaterThan(20)
    expect(test.worker.equipment.weapon?.durability).toBe(999)
    expect(test.commands).toContain('gather')
    expect(test.commands).toContain('market_trade')
})

it('a dead worker cannot gather or deliver and an absent merchant does not cause remote transfer', () => {
    const dead = fixture()
    dead.worker.alive = false
    for (let index = 0; index < 100; index += 1) {
        dead.tick()
    }
    expect(
        dead.service.resourceSnapshot(CENTER_LOCATION_ID)[0]?.remaining
    ).toBe(8)
    expect(dead.commands).toHaveLength(0)
    const absent = fixture(false)
    for (let index = 0; index < 1000; index += 1) {
        absent.tick()
    }
    expect(countInventoryItem(absent.worker.inventory, 'wood')).toBe(1)
    expect(
        absent.service.economy
            .snapshot(CENTER_LOCATION_ID, absent.now())
            ?.rows.find((row) => row.itemId === 'wood')?.stock
    ).toBe(6)
})

function fixture(merchantPresent = true) {
    let now = 0
    const navigation = new NavigationService({
        id: 'workers',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
    const node: AdventureResourceNode = {
        id: 'test-tree',
        kind: 'wood',
        source: 'tree',
        phase: 'ready',
        locationId: CENTER_LOCATION_ID,
        remaining: 8,
        bounds: { x: 80, y: 80, width: 16, height: 16 },
        position: { x: 88, y: 96 },
        collisionBounds: { x: 80, y: 80, width: 16, height: 16 },
        matureBounds: { x: 80, y: 80, width: 16, height: 16 },
    }
    const service = new AdventureService({
        now: () => now,
        resourceNodes: [node],
        worldObjects: [],
    })
    const worker = new GameCharacter({
        id: 'worker',
        nickname: 'worker',
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        spawnPosition: { x: 152, y: 24 },
    })
    const merchant = new GameCharacter({
        id: 'npc_merchant_1',
        nickname: 'merchant',
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        spawnPosition: { x: 24, y: 24 },
    })
    equipDirect(worker.equipment, createItemInstance('axe'))
    const controller = new EconomyWorkerController('lumberjack')
    const commands: string[] = []
    const characters = merchantPresent ? [worker, merchant] : [worker]
    const room = {
        adventureForWorkers: () => service,
        navigationFor: () => navigation,
        findVisibleTarget: () => undefined,
        getCharacter: (id: string) =>
            characters.find((actor) => actor.id === id),
        requestAdventure: (
            actor: GameCharacter,
            message: AdventureClientMessage,
            at: number
        ) => {
            commands.push(message.type)
            return service.handleResult(
                actor,
                message,
                characters,
                navigation,
                at
            )
        },
        publishEvents: () => undefined,
    } as unknown as GameRoom
    return {
        worker,
        service,
        commands,
        now: () => now,
        tick: () => {
            now += 50
            service.update(now, () => navigation, characters)
            controller.update(worker, room, now)
            advanceCharacter({
                character: worker,
                deltaMs: 50,
                now,
                navigation,
            })
        },
    }
}
