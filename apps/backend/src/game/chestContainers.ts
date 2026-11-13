import type {
    ChestClientMessage,
    ChestContainerSnapshot,
    GameEventPayload,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    chestOpenRefusal,
    chestRefusalNotice,
    type WorldChest,
} from './chestInteraction'
import { snapshotItem, transferInventoryItem } from './inventory'
import { cancelMovementMode } from './movementActions'
import type { NavigationService } from './navigation'

/** Views are private; the item instances remain in the shared world chest. */
export class ChestContainers {
    private readonly viewers = new Map<string, string>()

    public constructor(
        private readonly chests: ReadonlyMap<string, WorldChest>,
        private readonly navigation: NavigationService,
        private readonly locationId: string
    ) {}

    public handle(
        actor: GameCharacter,
        message: ChestClientMessage,
        now = Date.now()
    ): GameEventPayload[] {
        if (message.type === 'close_chest') {
            if (this.viewers.get(actor.id) === message.chestId) {
                this.close(actor.id)
            }
            return []
        }
        const chest = this.chests.get(message.chestId)
        const refusal = this.refusal(actor, chest, now)
        if (refusal !== undefined || chest === undefined) {
            this.close(actor.id)
            return chestRefusalNotice(actor.id, refusal ?? 'Сундук недоступен.')
        }
        if (message.type === 'open_chest') {
            actor.clearPath()
            actor.setMoveInput({ x: 0, y: 0 })
            cancelMovementMode(actor)
            this.viewers.set(actor.id, chest.id)
            const wasOpen = chest.opened
            chest.opened = true
            return wasOpen
                ? []
                : [{ actorId: actor.id, chestId: chest.id, kind: 'chest_open' }]
        }
        if (this.viewers.get(actor.id) !== chest.id) {
            return chestRefusalNotice(actor.id, 'Сначала открой этот сундук.')
        }
        if (message.type === 'put_chest_item') {
            return this.stash(actor, chest.id, message.itemInstanceId, now)
        }
        return message.type === 'take_chest_item'
            ? this.takeOne(actor, chest, message.itemInstanceId)
            : this.takeAll(actor, chest)
    }

    public stash(
        actor: GameCharacter,
        chestId: string | undefined,
        instanceId: string,
        now = Date.now()
    ): GameEventPayload[] {
        const chest =
            chestId === undefined ? undefined : this.chests.get(chestId)
        const refusal = this.refusal(actor, chest, now)
        if (refusal !== undefined || chest === undefined) {
            return chestRefusalNotice(actor.id, refusal ?? 'Сундук недоступен.')
        }
        const item = transferInventoryItem(
            actor.inventory,
            chest.contents,
            instanceId,
            Infinity
        )
        if (item === undefined) {
            return chestRefusalNotice(actor.id, 'Предмета больше нет в сумке.')
        }
        return [
            {
                actorId: actor.id,
                chestId: chest.id,
                itemId: item.itemId,
                audienceIds: [actor.id],
                kind: 'item_stash',
            },
        ]
    }

    public snapshot(
        actor: GameCharacter | undefined,
        now = Date.now()
    ): ChestContainerSnapshot | null {
        if (actor === undefined) {
            return null
        }
        const id = this.viewers.get(actor.id)
        if (id === undefined) {
            return null
        }
        const chest = this.chests.get(id)
        if (
            chest === undefined ||
            this.refusal(actor, chest, now) !== undefined
        ) {
            this.close(actor.id)
            return null
        }
        return { chestId: chest.id, items: chest.contents.map(snapshotItem) }
    }

    public close(actorId: string): void {
        this.viewers.delete(actorId)
    }

    public invalidate(chestId: string): void {
        for (const [actorId, id] of this.viewers) {
            if (id === chestId) {
                this.close(actorId)
            }
        }
    }

    public update(
        characters: ReadonlyMap<string, GameCharacter>,
        now: number
    ): void {
        for (const actorId of this.viewers.keys()) {
            const actor = characters.get(actorId)
            if (actor === undefined) {
                this.close(actorId)
            } else {
                this.snapshot(actor, now)
            }
        }
    }

    private refusal(
        actor: GameCharacter,
        chest: WorldChest | undefined,
        now: number
    ): string | undefined {
        return chest === undefined
            ? 'Такой сундук недоступен в этой локации.'
            : chestOpenRefusal(
                  actor,
                  chest.position,
                  this.navigation,
                  this.locationId,
                  now
              )
    }

    private takeOne(
        actor: GameCharacter,
        chest: WorldChest,
        instanceId: string
    ): GameEventPayload[] {
        const exists = chest.contents.some(
            (item) => item.instanceId === instanceId
        )
        if (!exists) {
            return chestRefusalNotice(actor.id, 'Этот предмет уже забрали.')
        }
        const item = transferInventoryItem(
            chest.contents,
            actor.inventory,
            instanceId
        )
        if (item === undefined) {
            return chestRefusalNotice(actor.id, 'В сумке нет свободного места.')
        }
        return [
            {
                actorId: actor.id,
                chestId: chest.id,
                itemId: item.itemId,
                audienceIds: [actor.id],
                kind: 'item_pickup',
            },
        ]
    }

    private takeAll(
        actor: GameCharacter,
        chest: WorldChest
    ): GameEventPayload[] {
        const events: GameEventPayload[] = []
        for (const candidate of [...chest.contents]) {
            const item = transferInventoryItem(
                chest.contents,
                actor.inventory,
                candidate.instanceId
            )
            if (item === undefined) {
                continue
            }
            events.push({
                actorId: actor.id,
                chestId: chest.id,
                itemId: item.itemId,
                audienceIds: [actor.id],
                kind: 'item_pickup',
            })
        }
        if (chest.contents.length > 0) {
            events.push(
                ...chestRefusalNotice(
                    actor.id,
                    'В сумке нет места для остальных предметов. Они остались в сундуке.'
                )
            )
        }
        return events
    }
}
