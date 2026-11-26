import {
    type AdventureClientMessage,
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
    type MarketItemId,
    type MarketRow,
    quoteMarketTrade,
    type Vector2,
} from '@my-game-ratata/contracts'
import { expect, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { createAdventureState } from '../src/game/adventureState'
import { GameCharacter } from '../src/game/character'
import { EconomyWorkerController } from '../src/game/economyWorkers'
import {
    addInventoryItems,
    createItemInstance,
    equipDirect,
} from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'
import { registerLumberjackEquipment } from '../src/game/workerEquipment'
import { WorldInventory } from '../src/game/worldInventory'
import { required } from './containerTestHelpers'

export function economyWorkerFixture(
    resourceNodes: AdventureResourceNode[],
    {
        merchantPresent = true,
        plantable = false,
    }: { merchantPresent?: boolean; plantable?: boolean } = {}
) {
    let now = 0
    const navigation = new NavigationService({
        id: CENTER_LOCATION_ID,
        width: 24,
        height: 24,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(24 * 24).fill(false),
        ...(plantable ? { plantable: Array<boolean>(24 * 24).fill(true) } : {}),
        cityAnchors: {
            'service.shop': { x: 56, y: 200 },
            'service.guild': { x: 56, y: 280 },
        },
        cityAreas: { plaza: { x: 24, y: 104, width: 64, height: 32 } },
    })
    const service = new AdventureService({
        now: () => now,
        resourceNodes,
        worldObjects: [],
    })
    const worker = cityActor('npc_lumberjack_1', { x: 72, y: 72 })
    worker.tags.add('worker.lumberjack')
    worker.tags.add(`worker.city.${CENTER_LOCATION_ID}`)
    equipDirect(worker.equipment, createItemInstance('axe'))
    equipDirect(worker.equipment, createItemInstance('boots'))
    registerLumberjackEquipment(worker)
    const merchant = cityActor('npc_merchant_1', { x: 24, y: 72 })
    const smith = cityActor('npc_smith_1', { x: 72, y: 24 })
    const controller = new EconomyWorkerController('lumberjack')
    const inventory = new WorldInventory(navigation)
    const deliveries = vi.spyOn(service, 'deliverWorkerSupplies')
    const characters = merchantPresent
        ? [worker, merchant, smith]
        : [worker, smith]
    const commands: AdventureClientMessage[] = []
    const room = {
        adventureForWorkers: () => service,
        navigationFor: () => navigation,
        charactersFor: () => characters,
        getCharacter: (id: string) =>
            characters.find((actor) => actor.id === id),
        findVisibleTarget: () => undefined,
        scenarioEnvironment: () => ({ items: inventory.snapshotItems() }),
        requestPickup: inventory.pickupItem.bind(inventory),
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
    const row = (itemId: MarketItemId) =>
        required(
            service.economy
                .snapshot(CENTER_LOCATION_ID, now)
                ?.rows.find((entry) => entry.itemId === itemId)
        )
    const tick = (at: number) => {
        const deltaMs = Math.min(100, at - now)
        now = at
        service.update(now, () => navigation, characters)
        controller.update(worker, room, now)
        advanceCharacter({ character: worker, deltaMs, now, navigation })
    }
    return {
        worker,
        merchant,
        smith,
        service,
        deliveries,
        commands,
        inventory,
        navigation,
        row,
        now: () => now,
        remaining: (id: string) =>
            service
                .resourceSnapshot(CENTER_LOCATION_ID)
                .find((node) => node.id === id)?.remaining,
        advanceTo: tick,
        run: (duration: number) => {
            const end = now + duration
            while (now < end) {
                tick(Math.min(now + 100, end))
            }
        },
        stockTo: (itemId: MarketItemId, stock: number) =>
            stockItems(service, merchant, row(itemId), stock, now),
    }
}

function stockItems(
    service: AdventureService,
    merchant: GameCharacter,
    row: MarketRow,
    stock: number,
    now: number
): void {
    const quantity = stock - row.stock
    const supplier = cityActor('supplier', merchant.position)
    expect(
        addInventoryItems(supplier.inventory, [
            createItemInstance(row.itemId, quantity),
        ])
    ).toBe(true)
    expect(
        service.economy.trade(
            supplier,
            createAdventureState(),
            {
                type: 'market_trade',
                npcId: merchant.id,
                side: 'sell',
                itemId: row.itemId,
                quantity,
                expectedTotal: quoteMarketTrade(row, 'sell', quantity) ?? 0,
                requestId: 'stock-test',
            },
            now
        ).accepted
    ).toBe(true)
}

export function source(
    kind: 'tree' | 'bush' | 'branches',
    position: Vector2 = { x: 200, y: 72 },
    id: string = kind
): AdventureResourceNode {
    const bounds = {
        x: position.x - 8,
        y: position.y - 16,
        width: 16,
        height: 16,
    }
    return {
        id,
        source: kind,
        locationId: CENTER_LOCATION_ID,
        kind: kind === 'tree' ? 'wood' : 'brushwood',
        phase: 'ready',
        remaining: kind === 'tree' ? 8 : kind === 'bush' ? 2 : 1,
        position,
        bounds,
        ...(kind === 'tree'
            ? { collisionBounds: bounds, matureBounds: bounds }
            : {}),
    }
}

function cityActor(id: string, spawnPosition: Vector2): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        spawnPosition,
    })
}
