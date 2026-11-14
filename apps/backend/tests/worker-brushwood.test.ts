import {
    type AdventureClientMessage,
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
    type MarketItemId,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { createAdventureState } from '../src/game/adventureState'
import { GameCharacter } from '../src/game/character'
import { EconomyWorkerController } from '../src/game/economyWorkers'
import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
    equipDirect,
} from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'

it('prioritizes wood and keeps supplemental brushwood on an independent ten-minute budget', () => {
    const test = fixture([source('tree'), source('bush')])
    test.run(10_000)
    expect(
        test.commands
            .filter((command) => command.type === 'gather')
            .map((command) => command.nodeId)
    ).toEqual(['tree', 'bush'])
    expect(test.stock('wood')).toBe(7)
    expect(test.stock('brushwood')).toBe(7)
    test.at(600_000)
    expect(test.remaining('tree')).toBe(7)
    test.run(10_000)
    expect(test.remaining('tree')).toBe(6)
    expect(test.remaining('bush')).toBe(0)
    expect(
        test.commands
            .filter((command) => command.type === 'gather')
            .map((command) => command.nodeId)
    ).toEqual(['tree', 'bush', 'tree', 'bush'])
})

it('keeps brushwood local, rejects distant, hidden and unreachable sources, and never sets out solely to sell it', () => {
    const nearby = source('branches', 'map-2-1')
    const test = fixture([nearby], 'map-2-1')
    test.run(5_000)
    expect(test.remaining('branches', 'map-2-1')).toBe(0)
    expect(countInventoryItem(test.worker.inventory, 'brushwood')).toBe(1)
    expect(test.worker.locationId).toBe('map-2-1')
    expect(test.worker.hasPath()).toBe(false)
    expect(test.worker.getMoveInput()).toEqual({ x: 0, y: 0 })
    expect(test.commands.map((command) => command.type)).toEqual(['gather'])

    const distant = fixture([
        {
            ...source('branches'),
            position: { x: 296, y: 296 },
            bounds: { x: 288, y: 288, width: 16, height: 16 },
        },
    ])
    distant.run(5_000)
    expect(distant.commands).toHaveLength(0)
    const hidden = fixture([source('branches')])
    for (let y = 0; y < 20; y += 1) {
        hidden.navigation.grid.solid[y * 20 + 4] = true
    }
    hidden.run(5_000)
    expect(hidden.commands).toHaveLength(0)
})

it('walks to a reachable nearby branch source before shared gathering and a real city sale', () => {
    const node = {
        ...source('branches'),
        bounds: { x: 160, y: 16, width: 16, height: 16 },
        position: { x: 168, y: 32 },
    }
    const test = fixture([node])
    const start = { ...test.worker.position }
    test.run(5_000)
    expect(test.commands.map((command) => command.type)).toEqual([
        'gather',
        'market_trade',
    ])
    expect(test.worker.position.x).not.toBe(start.x)
    expect(test.stock('brushwood')).toBe(7)
    expect(test.service.snapshot(test.worker.id).gold).toBeGreaterThan(20)
})

it('falls back when ordinary wood has no route and only spends the brushwood period on success', () => {
    const tree = {
        ...source('tree'),
        position: { x: 200, y: 32 },
        bounds: { x: 192, y: 16, width: 16, height: 16 },
    }
    const test = fixture([tree, source('bush')])
    for (let y = 0; y < 20; y += 1) {
        test.navigation.grid.solid[y * 20 + 8] = true
    }
    test.worker.energy = 0
    test.at(50)
    expect(test.remaining('bush')).toBe(2)
    expect(test.remaining('tree')).toBe(8)
    test.worker.energy = 10
    test.at(550)
    expect(test.remaining('bush')).toBe(1)
    expect(test.remaining('tree')).toBe(8)
    test.run(5_000)
    expect(test.remaining('bush')).toBe(1)
    expect(test.stock('brushwood')).toBe(7)
})

it.each([false, true])(
    'collects branches into a partial stack when wood work is unavailable (axe: %s)',
    (withAxe) => {
        const test = fixture(
            [source('tree', 'map-2-1'), source('branches', 'map-2-1')],
            'map-2-1'
        )
        if (!withAxe) {
            test.worker.equipment = {}
        }
        test.worker.inventory = [
            createItemInstance('brushwood', 8),
            ...Array.from({ length: 49 }, () => createItemInstance('food')),
        ]
        test.at(50)
        expect(test.remaining('tree', 'map-2-1')).toBe(8)
        expect(test.remaining('branches', 'map-2-1')).toBe(0)
        expect(countInventoryItem(test.worker.inventory, 'brushwood')).toBe(9)
        test.worker.inventory = [createItemInstance('brushwood', 9)]
        equipDirect(test.worker.equipment, createItemInstance('axe'))
        test.at(2_000)
        expect(test.remaining('tree', 'map-2-1')).toBe(7)
    }
)

it('skips a bush whose energy cost is unavailable to collect accessible free branches', () => {
    const bush = {
        ...source('bush'),
        position: { x: 64, y: 32 },
        bounds: { x: 56, y: 16, width: 16, height: 16 },
    }
    const test = fixture([bush, source('branches')])
    test.worker.energy = 0
    test.at(50)
    expect(test.remaining('bush')).toBe(2)
    expect(test.remaining('branches')).toBe(0)
    expect(countInventoryItem(test.worker.inventory, 'brushwood')).toBe(1)
})

it('skips full commodity rows, sells wood first, and continues ordinary wood work with full brushwood stock', () => {
    const test = fixture([source('tree'), source('bush')])
    test.fill('brushwood')
    test.worker.inventory.push(createItemInstance('brushwood'))
    test.run(10_000)
    expect(test.remaining('tree')).toBe(7)
    expect(test.remaining('bush')).toBe(2)
    expect(test.stock('wood')).toBe(7)
    expect(test.stock('brushwood')).toBe(24)
    expect(countInventoryItem(test.worker.inventory, 'brushwood')).toBe(1)
    test.at(600_050)
    test.run(10_000)
    expect(test.remaining('tree')).toBe(6)

    const fullWood = fixture([])
    fullWood.fill('wood')
    fullWood.worker.inventory.push(
        createItemInstance('wood'),
        createItemInstance('brushwood')
    )
    fullWood.run(2_000)
    expect(
        fullWood.commands
            .filter((command) => command.type === 'market_trade')
            .map((command) => command.itemId)
    ).toEqual(['brushwood'])
    expect(countInventoryItem(fullWood.worker.inventory, 'wood')).toBe(1)
    expect(fullWood.worker.hasPath()).toBe(false)
})

it('sells wood before incidental brushwood, without spending the supplemental work allowance', () => {
    const tree = { ...source('tree'), remaining: 1 }
    const test = fixture([tree, source('bush')])
    test.run(10_000)
    expect(
        test.commands
            .filter((command) => command.type === 'market_trade')
            .map((command) => command.itemId)
    ).toEqual(['wood', 'brushwood', 'brushwood'])
    expect(test.remaining('bush')).toBe(1)
    expect(test.stock('brushwood')).toBe(8)
})

it('keeps wood sale priority independent of commodity configuration order', () => {
    const test = fixture([])
    test.worker.inventory.push(
        createItemInstance('wood'),
        createItemInstance('brushwood')
    )
    const snapshot = test.service.economy.snapshot.bind(test.service.economy)
    const reversed = vi
        .spyOn(test.service.economy, 'snapshot')
        .mockImplementation((cityId, now) => {
            const market = snapshot(cityId, now)
            market?.rows.reverse()
            return market
        })
    test.run(2_000)
    expect(
        test.commands
            .filter((command) => command.type === 'market_trade')
            .map((command) => command.itemId)
    ).toEqual(['wood', 'brushwood'])
    reversed.mockRestore()
})

function source(
    source: 'tree' | 'bush' | 'branches',
    locationId = CENTER_LOCATION_ID
): AdventureResourceNode {
    return {
        id: source,
        source,
        locationId,
        kind: source === 'tree' ? 'wood' : 'brushwood',
        phase: 'ready',
        remaining: source === 'tree' ? 8 : source === 'bush' ? 2 : 1,
        position: { x: 88, y: 32 },
        bounds: { x: 80, y: 16, width: 16, height: 16 },
        ...(source === 'tree'
            ? {
                  treeSize: 'adult',
                  matureBounds: { x: 80, y: 16, width: 16, height: 16 },
              }
            : {}),
    }
}

function fixture(
    nodes: AdventureResourceNode[],
    locationId = CENTER_LOCATION_ID
) {
    let now = 0
    const navigation = new NavigationService({
        id: 'worker',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
    const service = new AdventureService({
        now: () => now,
        resourceNodes: nodes,
        worldObjects: [],
    })
    const worker = new GameCharacter({
        id: 'worker',
        nickname: 'worker',
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        locationId,
        spawnPosition: { x: 40, y: 24 },
    })
    const merchant = cityActor('npc_merchant_1')
    equipDirect(worker.equipment, createItemInstance('axe'))
    const controller = new EconomyWorkerController('lumberjack')
    const commands: AdventureClientMessage[] = []
    const characters = [worker, merchant]
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
            commands.push(message)
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
    const at = (time: number) => {
        now = time
        service.update(now, () => navigation, characters)
        controller.update(worker, room, now)
        advanceCharacter({ character: worker, deltaMs: 50, now, navigation })
    }
    return {
        worker,
        service,
        navigation,
        commands,
        at,
        remaining: (id: string, where = CENTER_LOCATION_ID) =>
            service.resourceSnapshot(where).find((node) => node.id === id)
                ?.remaining,
        stock: (id: MarketItemId) =>
            service.economy
                .snapshot(CENTER_LOCATION_ID, now)
                ?.rows.find((row) => row.itemId === id)?.stock,
        run: (duration: number) => {
            const end = now + duration
            while (now < end) {
                at(now + 50)
            }
        },
        fill: (id: MarketItemId) => {
            const supplier = new GameCharacter({
                id: 'supplier',
                nickname: 'supplier',
                archetype: 'human',
                controllerKind: 'scripted',
                spawnPosition: { x: 24, y: 24 },
            })
            const row = service.economy
                .snapshot(CENTER_LOCATION_ID, now)
                ?.rows.find((candidate) => candidate.itemId === id)
            if (row === undefined) {
                throw new Error('Expected market row')
            }
            const quantity = row.capacity - row.stock
            addInventoryItems(supplier.inventory, [
                createItemInstance(id, quantity),
            ])
            expect(
                service.economy.trade(
                    supplier,
                    createAdventureState(),
                    {
                        type: 'market_trade',
                        npcId: merchant.id,
                        side: 'sell',
                        itemId: id,
                        quantity,
                        expectedTotal:
                            quoteMarketTrade(row, 'sell', quantity) ?? 0,
                        requestId: 'fill',
                    },
                    now
                ).accepted
            ).toBe(true)
        },
    }
}

function cityActor(id: string): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        spawnPosition: { x: 24, y: 24 },
    })
}
