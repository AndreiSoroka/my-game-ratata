import {
    CENTER_LOCATION_ID,
    type MarketClientMessage,
    type MarketItemId,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { restoreCharacter } from '../src/game/characterRecovery'
import type { CityEconomyService } from '../src/game/cityEconomy'
import { createItemInstance, equipDirect } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { NavigationService } from '../src/game/navigation'
import { WorldInventory } from '../src/game/worldInventory'

function character(id = 'hero', scripted = false): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: scripted ? 'scripted' : 'network_player',
        faction: 'peaceful',
        spawnPosition: { x: 24, y: 24 },
    })
}
function row(economy: CityEconomyService, itemId: MarketItemId, now = 0) {
    return required(
        required(economy.snapshot(CENTER_LOCATION_ID, now)).rows.find(
            (entry) => entry.itemId === itemId
        )
    )
}
function grid(): NavigationService {
    return new NavigationService({
        id: 'test',
        solidLayerNames: [],
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
    })
}

it('sells and equips portable lights through normal commands, with public light and private instances', () => {
    let now = 0
    const service = new AdventureService({
        now: () => now,
        resourceNodes: [],
        worldObjects: [],
    })
    const actor = character()
    const merchant = character('npc_merchant_1', true)
    const smith = character('npc_smith_1', true)
    const navigation = grid()
    const inventory = new WorldInventory(navigation)
    const sword = createItemInstance('simple_sword')
    expect(equipDirect(actor.equipment, sword)).toBe(true)
    service.grantGoldOnce(actor.id, 30, 'seed')

    for (const itemId of ['torch', 'lantern'] as const) {
        const command: MarketClientMessage = {
            type: 'market_trade',
            npcId: merchant.id,
            side: 'buy',
            itemId,
            quantity: 1,
            expectedTotal: required(row(service.economy, itemId).buyPrice),
            requestId: `buy-${itemId}`,
        }
        expect(parseClientMessage(JSON.stringify(command)).message).toEqual(
            command
        )
        expect(
            service.handleResult(
                actor,
                { ...command, npcId: smith.id, requestId: `smith-${itemId}` },
                [smith],
                navigation,
                now
            ).accepted
        ).toBe(false)
        expect(
            service.handleResult(actor, command, [merchant], navigation, now)
                .accepted
        ).toBe(true)
        expect(
            service.handleResult(actor, command, [merchant], navigation, now)
                .accepted
        ).toBe(true)
    }
    expect(service.snapshot(actor.id).gold).toBe(17)
    expect(actor.inventory.map((item) => item.itemId)).toEqual([
        'torch',
        'lantern',
    ])
    expect(actor.snapshot(now).lightSource).toBeUndefined()
    const [torch, lantern] = actor.inventory
    expect(
        inventory.applyInventoryAction(
            actor,
            'equip',
            required(torch).instanceId,
            now
        )
    ).toMatchObject([{ itemId: 'torch', kind: 'item_equip' }])
    expect(actor.snapshot(now)).toMatchObject({
        lightSource: 'torch',
        equipment: { light: torch },
    })
    expect(actor.snapshot(now, false).lightSource).toBe('torch')
    expect(actor.snapshot(now, false).equipment.light).toBeUndefined()
    expect(
        inventory.applyInventoryAction(
            actor,
            'equip',
            required(lantern).instanceId,
            now
        )
    ).toHaveLength(1)
    expect(actor.inventory).toEqual([torch])
    expect(actor.equipment.weapon).toBe(sword)
    expect(actor.snapshot(now).lightSource).toBe('lantern')

    actor.applyDamage(actor.maxHp, now)
    expect(actor.snapshot(now).lightSource).toBeUndefined()
    expect(inventory.unequip(actor, 'light', now)).toHaveLength(0)
    restoreCharacter(actor, now, false)
    expect(actor.snapshot(now).lightSource).toBe('lantern')
    const unequip = {
        type: 'equipment_action',
        action: 'unequip',
        slot: 'light',
    }
    expect(parseClientMessage(JSON.stringify(unequip)).message).toEqual(unequip)
    expect(inventory.unequip(actor, 'light', now)).toHaveLength(1)
    expect(actor.inventory).toEqual([torch, lantern])
    expect(actor.snapshot(now).lightSource).toBeUndefined()
    expect(actor.equipment.weapon).toBe(sword)

    expect(row(service.economy, 'torch').stock).toBe(11)
    expect(row(service.economy, 'lantern').stock).toBe(5)
    now = 599_999
    service.economy.update(now)
    expect(row(service.economy, 'torch', now).stock).toBe(11)
    now = 600_000
    service.economy.update(now)
    service.economy.update(now)
    expect(row(service.economy, 'torch', now)).toMatchObject({
        stock: 13,
        deliveredLast10Minutes: 2,
    })
    expect(row(service.economy, 'lantern', now)).toMatchObject({
        stock: 6,
        deliveredLast10Minutes: 1,
    })
})

function required<T>(value: T | null | undefined): T {
    if (value === undefined || value === null) {
        throw new Error('Expected defined test value')
    }
    return value
}
