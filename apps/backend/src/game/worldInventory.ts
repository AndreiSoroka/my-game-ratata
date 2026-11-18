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
import { invalidateWeaponAction } from './combatState'
import type { CorpseWallet } from './corpseWallet'
import {
    equipInventoryItem,
    type InventoryItemInstance,
    itemQuantity,
    removeInventoryItem,
    unequipItem,
} from './inventory'
import { resetMartyrStreak } from './martyr'
import type { NavigationService } from './navigation'
import { canPerformSkillAction } from './skillProgression'
import { recordVitalityRecovery } from './vitalityPractice'
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
        private readonly locationId = navigation.grid.id,
        wallet?: CorpseWallet,
        random: () => number = Math.random
    ) {
        this.chests = createWorldChests(navigation, locationId, random)
        this.deathLoot = new WorldDeathLoot(locationId, this.chests, wallet)
        this.containers = new ChestContainers(
            this.chests,
            navigation,
            locationId,
            wallet
        )
    }

    public applyInventoryAction(
        player: GameCharacter,
        action: InventoryActionKind,
        itemInstanceId: string,
        now = Date.now()
    ): GameEventPayload[] {
        if (!canPerformSkillAction(player, now)) {
            return []
        }
        switch (action) {
            case 'eat':
                return this.eatInventoryItem(player, itemInstanceId, now)
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
            now,
            this.navigation
        )
    }

    public unequip(
        player: GameCharacter,
        slot: Parameters<typeof unequipItem>[2],
        now = Date.now()
    ): GameEventPayload[] {
        if (!canPerformSkillAction(player, now)) {
            return []
        }
        const item = unequipItem(player.inventory, player.equipment, slot)
        if (item !== undefined && slot === 'weapon') {
            invalidateWeaponAction(player, Date.now())
        }

        if (item === undefined) {
            return []
        }
        resetMartyrStreak(player)
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

    public finalizeDeath(
        actor: GameCharacter,
        now: number,
        abandoned = false
    ): GameEventPayload[] {
        return this.deathLoot.finalize(actor, now, abandoned)
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
                    chest.kind !== 'corpse' &&
                    isPointInZones(chest.position, actor.attackZones) &&
                    chestHasLineOfSight(
                        actor.position,
                        chest.position,
                        this.navigation,
                        undefined,
                        chest.bounds
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
            ...(chest.kind !== undefined
                ? { kind: chest.kind, title: chest.title, corpse: chest.corpse }
                : {}),
            ...(chest.propId === undefined ? {} : { propId: chest.propId }),
            ...(chest.bounds === undefined
                ? {}
                : { bounds: { ...chest.bounds } }),
            id: chest.id,
            itemCount: chest.contents.length,
            position: chest.position,
            state: chest.opened ? 'open' : 'closed',
        }))
    }

    private eatInventoryItem(
        player: GameCharacter,
        itemInstanceId: string,
        now: number
    ): GameEventPayload[] {
        const item = player.inventory.find(
            (candidate) => candidate.instanceId === itemInstanceId
        )
        const healHp =
            item === undefined
                ? undefined
                : ITEM_DEFINITIONS[item.itemId].healHp

        if (
            item === undefined ||
            healHp === undefined ||
            player.hp >= player.maxHp
        ) {
            return []
        }

        if (
            removeInventoryItem(player.inventory, itemInstanceId) === undefined
        ) {
            return []
        }
        resetMartyrStreak(player)
        const beforeHp = player.hp
        const restored = heal(player, healHp)
        return [
            {
                actorId: player.id,
                amount: restored,
                itemId: item.itemId,
                kind: 'item_eat',
            },
            ...recordVitalityRecovery(player, player.hp - beforeHp, now),
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

        if (item === undefined) {
            return []
        }
        if (player.equipment.weapon?.instanceId === item.instanceId) {
            invalidateWeaponAction(player, Date.now())
        }
        resetMartyrStreak(player)
        return [{ actorId: player.id, itemId: item.itemId, kind: 'item_equip' }]
    }

    private dropInventoryItem(
        player: GameCharacter,
        itemInstanceId: string
    ): GameEventPayload[] {
        const item = removeInventoryItem(player.inventory, itemInstanceId)

        if (item === undefined) {
            return []
        }

        resetMartyrStreak(player)
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
        const chest = findNearestChest(
            [...this.chests.values()].filter((item) => item.kind !== 'corpse'),
            player.position
        )
        return this.containers.stash(player, chest?.id, itemInstanceId)
    }

    private openChest(
        actor: GameCharacter,
        chest: WorldChest
    ): GameEventPayload[] {
        this.containers.invalidate(chest.id)
        return revealChestContents(actor, chest, (item, position) =>
            this.dropAtReachablePosition(item, position, actor.position)
        )
    }

    public dropItemNear(item: InventoryItemInstance, origin: Vector2): void {
        const position = dropPosition(origin, this.nextLooseItemIndex)
        this.dropAtReachablePosition(item, position, origin)
    }

    private dropAtReachablePosition(
        item: InventoryItemInstance,
        position: Vector2,
        origin: Vector2
    ): void {
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
