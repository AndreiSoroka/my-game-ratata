import {
    type GameEventPayload,
    type InventoryActionKind,
    ITEM_DEFINITIONS,
    type Vector2,
    type WorldChestSnapshot,
    type WorldItemSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    addInventoryItem,
    createItemInstance,
    equipInventoryItem,
    type InventoryItemInstance,
    removeInventoryItem,
    unequipItem,
} from './inventory'
import { distance } from './math'
import type { NavigationService } from './navigation'
import {
    dropPosition,
    generateChestContents,
    heal,
    isPointInZones,
} from './worldInventoryHelpers'

const pickupRadius = 24
const chestInteractionRadius = 28

interface LooseWorldItem {
    id: string
    item: InventoryItemInstance
    position: Vector2
}

interface WorldChest {
    contents: InventoryItemInstance[]
    id: string
    opened: boolean
    position: Vector2
}

export class WorldInventory {
    private readonly chests = new Map<string, WorldChest>()
    private readonly looseItems = new Map<string, LooseWorldItem>()
    private nextLooseItemIndex = 1

    public constructor(navigation: NavigationService) {
        this.spawnChests(navigation)
    }

    public applyInventoryAction(
        player: GameCharacter,
        action: InventoryActionKind,
        itemInstanceId: string
    ): GameEventPayload[] {
        switch (action) {
            case 'eat':
                return this.eatInventoryItem(player, itemInstanceId)
            case 'equip':
                return this.equipInventoryItem(player, itemInstanceId)
            case 'drop':
                return this.dropInventoryItem(player, itemInstanceId)
            case 'stash':
                return this.stashInventoryItem(player, itemInstanceId)
        }
    }

    public pickupNearestItem(player: GameCharacter): GameEventPayload[] {
        const item = this.findNearestLooseItem(player)

        if (
            item === undefined ||
            !addInventoryItem(player.inventory, item.item)
        ) {
            return []
        }

        this.looseItems.delete(item.id)

        return [
            {
                actorId: player.id,
                itemId: item.item.itemId,
                kind: 'item_pickup',
            },
        ]
    }

    public unequip(
        player: GameCharacter,
        slot: Parameters<typeof unequipItem>[2]
    ): GameEventPayload[] {
        const item = unequipItem(player.inventory, player.equipment, slot)

        if (item === undefined) {
            return []
        }

        return [
            {
                actorId: player.id,
                itemId: item.itemId,
                kind: 'item_equip',
            },
        ]
    }

    public dropLootForDeaths(
        events: GameEventPayload[],
        findCharacter: (id: string) => GameCharacter | undefined
    ): GameEventPayload[] {
        const lootEvents: GameEventPayload[] = []

        for (const event of events) {
            const target =
                event.targetId === undefined
                    ? undefined
                    : findCharacter(event.targetId)

            if (
                event.kind !== 'death' ||
                target?.archetype !== 'skeleton' ||
                Math.random() >= 0.5
            ) {
                continue
            }

            const item = createItemInstance('old_sword')
            const lootEvent: GameEventPayload = {
                itemId: item.itemId,
                kind: 'item_drop',
                targetId: target.id,
            }

            if (event.actorId !== undefined) {
                lootEvent.actorId = event.actorId
            }

            this.dropItemNear(item, target.position)
            lootEvents.push(lootEvent)
        }

        return lootEvents
    }

    public openChestsHitBy(actor: GameCharacter): GameEventPayload[] {
        return [...this.chests.values()]
            .filter((chest) =>
                isPointInZones(chest.position, actor.attackZones)
            )
            .flatMap((chest) => this.openChest(actor, chest))
    }

    public snapshotItems(): WorldItemSnapshot[] {
        return [...this.looseItems.values()].map((item) => ({
            id: item.id,
            itemId: item.item.itemId,
            position: item.position,
        }))
    }

    public snapshotChests(): WorldChestSnapshot[] {
        return [...this.chests.values()].map((chest) => ({
            id: chest.id,
            itemCount: chest.contents.length,
            position: chest.position,
            state:
                chest.opened && chest.contents.length === 0 ? 'open' : 'closed',
        }))
    }

    private eatInventoryItem(
        player: GameCharacter,
        itemInstanceId: string
    ): GameEventPayload[] {
        const item = player.inventory.find(
            (candidate) => candidate.instanceId === itemInstanceId
        )
        const healHp =
            item === undefined
                ? undefined
                : ITEM_DEFINITIONS[item.itemId].healHp

        if (item === undefined || healHp === undefined) {
            return []
        }

        removeInventoryItem(player.inventory, itemInstanceId)

        return [
            {
                actorId: player.id,
                amount: heal(player, healHp),
                itemId: item.itemId,
                kind: 'item_eat',
            },
        ]
    }

    private equipInventoryItem(
        player: GameCharacter,
        itemInstanceId: string
    ): GameEventPayload[] {
        const item = equipInventoryItem(
            player.inventory,
            player.equipment,
            itemInstanceId
        )

        return item === undefined
            ? []
            : [{ actorId: player.id, itemId: item.itemId, kind: 'item_equip' }]
    }

    private dropInventoryItem(
        player: GameCharacter,
        itemInstanceId: string
    ): GameEventPayload[] {
        const item = removeInventoryItem(player.inventory, itemInstanceId)

        if (item === undefined) {
            return []
        }

        this.dropItemNear(item, player.position)

        return [
            {
                actorId: player.id,
                itemId: item.itemId,
                kind: 'item_drop',
            },
        ]
    }

    private stashInventoryItem(
        player: GameCharacter,
        itemInstanceId: string
    ): GameEventPayload[] {
        const chest = this.findNearestChest(player.position)
        const item = removeInventoryItem(player.inventory, itemInstanceId)

        if (chest === undefined || item === undefined) {
            if (item !== undefined) {
                addInventoryItem(player.inventory, item)
            }

            return []
        }

        chest.contents.push(item)
        chest.opened = false

        return [
            {
                actorId: player.id,
                chestId: chest.id,
                itemId: item.itemId,
                kind: 'item_stash',
            },
        ]
    }

    private openChest(
        actor: GameCharacter,
        chest: WorldChest
    ): GameEventPayload[] {
        if (chest.opened && chest.contents.length === 0) {
            return []
        }

        const contents = chest.contents.splice(0)
        chest.opened = true

        for (const [index, item] of contents.entries()) {
            this.createLooseItem(item, dropPosition(chest.position, index))
        }

        return [{ actorId: actor.id, chestId: chest.id, kind: 'chest_open' }]
    }

    private dropItemNear(item: InventoryItemInstance, origin: Vector2): void {
        this.createLooseItem(
            item,
            dropPosition(origin, this.nextLooseItemIndex)
        )
    }

    private createLooseItem(
        item: InventoryItemInstance,
        position: Vector2
    ): void {
        const looseItem = {
            id: `world_item_${String(this.nextLooseItemIndex)}`,
            item,
            position,
        }
        this.nextLooseItemIndex += 1
        this.looseItems.set(looseItem.id, looseItem)
    }

    private findNearestLooseItem(
        player: GameCharacter
    ): LooseWorldItem | undefined {
        return [...this.looseItems.values()]
            .map((item) => ({
                distance: distance(player.position, item.position),
                item,
            }))
            .filter((candidate) => candidate.distance <= pickupRadius)
            .sort((a, b) => a.distance - b.distance)[0]?.item
    }

    private findNearestChest(position: Vector2): WorldChest | undefined {
        return [...this.chests.values()]
            .map((chest) => ({
                chest,
                distance: distance(position, chest.position),
            }))
            .filter((candidate) => candidate.distance <= chestInteractionRadius)
            .sort((a, b) => a.distance - b.distance)[0]?.chest
    }

    private spawnChests(navigation: NavigationService): void {
        this.chests.set('chest_forest_1', {
            contents: generateChestContents(),
            id: 'chest_forest_1',
            opened: false,
            position: navigation.tileToWorld({ x: 6, y: 4 }),
        })
    }
}
