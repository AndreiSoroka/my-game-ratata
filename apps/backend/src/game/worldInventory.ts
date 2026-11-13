import {
    type GameEventPayload,
    type InventoryActionKind,
    ITEM_DEFINITIONS,
    type Vector2,
    type WorldChestSnapshot,
    type WorldItemSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { ChestContainers } from './chestContainers'
import {
    chestHasLineOfSight,
    createWorldChests,
    findNearestChest,
    revealChestContents,
    type WorldChest,
} from './chestInteraction'
import {
    equipInventoryItem,
    type InventoryItemInstance,
    itemQuantity,
    removeInventoryItem,
    unequipItem,
} from './inventory'
import type { NavigationService } from './navigation'
import { WorldDeathLoot } from './worldDeathLoot'
import { dropPosition, heal, isPointInZones } from './worldInventoryHelpers'
import { type LooseWorldItem, pickupWorldItem } from './worldPickup'

export class WorldInventory {
    public readonly containers: ChestContainers
    private readonly deathLoot: WorldDeathLoot
    private readonly chests: Map<string, WorldChest>
    private readonly looseItems = new Map<string, LooseWorldItem>()
    private nextLooseItemIndex = 1

    public constructor(
        private readonly navigation: NavigationService,
        private readonly locationId = navigation.grid.id
    ) {
        this.deathLoot = new WorldDeathLoot(locationId, (item, position) =>
            this.dropItemNear(item, position)
        )
        this.chests = createWorldChests(navigation)
        this.containers = new ChestContainers(
            this.chests,
            navigation,
            locationId
        )
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
        return this.pickupItem(player)
    }

    public pickupItem(
        player: GameCharacter,
        worldItemId?: string,
        now = Date.now()
    ): GameEventPayload[] {
        return pickupWorldItem(
            player,
            this.looseItems,
            this.locationId,
            worldItemId,
            now
        )
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
        return this.deathLoot.resolve(events, findCharacter)
    }

    public openChestById(
        actor: GameCharacter,
        chestId: string,
        now = Date.now()
    ): GameEventPayload[] {
        return this.containers.handle(
            actor,
            { type: 'open_chest', chestId },
            now
        )
    }

    public openChestsHitBy(actor: GameCharacter): GameEventPayload[] {
        return [...this.chests.values()]
            .filter(
                (chest) =>
                    isPointInZones(chest.position, actor.attackZones) &&
                    chestHasLineOfSight(
                        actor.position,
                        chest.position,
                        this.navigation
                    )
            )
            .flatMap((chest) => this.openChest(actor, chest))
    }

    public snapshotItems(): WorldItemSnapshot[] {
        return [...this.looseItems.values()].map((item) => ({
            id: item.id,
            itemId: item.item.itemId,
            ...(itemQuantity(item.item) === 1
                ? {}
                : { quantity: itemQuantity(item.item) }),
            position: item.position,
        }))
    }

    public snapshotChests(): WorldChestSnapshot[] {
        return [...this.chests.values()].map((chest) => ({
            id: chest.id,
            itemCount: chest.contents.length,
            position: chest.position,
            state: chest.opened ? 'open' : 'closed',
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
        const chest = findNearestChest(this.chests.values(), player.position)
        return this.containers.stash(player, chest?.id, itemInstanceId)
    }

    private openChest(
        actor: GameCharacter,
        chest: WorldChest
    ): GameEventPayload[] {
        this.containers.invalidate(chest.id)
        return revealChestContents(actor, chest, (item, position) =>
            this.createLooseItem(item, position)
        )
    }

    private dropItemNear(item: InventoryItemInstance, origin: Vector2): void {
        const position = dropPosition(origin, this.nextLooseItemIndex)
        const reachable =
            !this.navigation.isSolidTile(
                this.navigation.worldToTile(position)
            ) && this.navigation.hasLineOfSight(origin, position)
        this.createLooseItem(item, reachable ? position : origin)
    }

    private createLooseItem(
        item: InventoryItemInstance,
        position: Vector2
    ): void {
        const looseItem = {
            id: `${this.locationId}:world_item_${String(this.nextLooseItemIndex)}`,
            item,
            position,
        }
        this.nextLooseItemIndex += 1
        this.looseItems.set(looseItem.id, looseItem)
    }
}
