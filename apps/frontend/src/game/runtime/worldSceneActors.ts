import type { ItemId, WorldChestSnapshot, WorldItemSnapshot } from '@my-game-ratata/contracts'
import { Actor, type Engine, type ImageSource, Sprite, vec } from 'excalibur'

interface ItemBundle {
    actor: Actor
    itemId: ItemId
}

interface ChestBundle {
    actor: Actor
    state: WorldChestSnapshot['state']
}

export class WorldSceneActors {
    private readonly chestActors = new Map<string, ChestBundle>()
    private readonly chestImage: ImageSource
    private readonly engine: Engine
    private readonly itemActors = new Map<string, ItemBundle>()
    private readonly itemImages: Map<ItemId, ImageSource>

    public constructor(
        engine: Engine,
        itemImages: Map<ItemId, ImageSource>,
        chestImage: ImageSource
    ) {
        this.engine = engine
        this.itemImages = itemImages
        this.chestImage = chestImage
    }

    public update(items: WorldItemSnapshot[], chests: WorldChestSnapshot[]): void {
        this.updateItems(items)
        this.updateChests(chests)
    }

    private updateItems(items: WorldItemSnapshot[]): void {
        const liveIds = new Set(items.map((item) => item.id))

        for (const [id, bundle] of this.itemActors) {
            if (!liveIds.has(id)) {
                this.engine.remove(bundle.actor)
                this.itemActors.delete(id)
            }
        }

        for (const item of items) {
            const bundle = this.getItemBundle(item)
            bundle.actor.pos = vec(item.position.x, item.position.y)
            bundle.actor.z = item.position.y - 1

            if (bundle.itemId !== item.itemId) {
                this.applyItemGraphic(bundle.actor, item.itemId)
                bundle.itemId = item.itemId
            }
        }
    }

    private updateChests(chests: WorldChestSnapshot[]): void {
        const liveIds = new Set(chests.map((chest) => chest.id))

        for (const [id, bundle] of this.chestActors) {
            if (!liveIds.has(id)) {
                this.engine.remove(bundle.actor)
                this.chestActors.delete(id)
            }
        }

        for (const chest of chests) {
            const bundle = this.getChestBundle(chest)
            bundle.actor.pos = vec(chest.position.x, chest.position.y)
            bundle.actor.z = chest.position.y

            if (bundle.state !== chest.state) {
                bundle.actor.graphics.use(chestSprite(this.chestImage, chest.state))
                bundle.state = chest.state
            }
        }
    }

    private getItemBundle(item: WorldItemSnapshot): ItemBundle {
        const existing = this.itemActors.get(item.id)

        if (existing !== undefined) {
            return existing
        }

        const actor = new Actor({
            anchor: vec(0.5, 0.5),
            height: 16,
            width: 16,
        })
        this.applyItemGraphic(actor, item.itemId)
        const bundle = { actor, itemId: item.itemId }
        this.itemActors.set(item.id, bundle)
        this.engine.add(actor)

        return bundle
    }

    private getChestBundle(chest: WorldChestSnapshot): ChestBundle {
        const existing = this.chestActors.get(chest.id)

        if (existing !== undefined) {
            return existing
        }

        const actor = new Actor({
            anchor: vec(0.5, 0.75),
            height: 16,
            width: 16,
        })
        actor.graphics.use(chestSprite(this.chestImage, chest.state))
        const bundle = { actor, state: chest.state }
        this.chestActors.set(chest.id, bundle)
        this.engine.add(actor)

        return bundle
    }

    private applyItemGraphic(actor: Actor, itemId: ItemId): void {
        const image = this.itemImages.get(itemId)

        if (image !== undefined) {
            actor.graphics.use(image.toSprite())
        }
    }
}

function chestSprite(image: ImageSource, state: WorldChestSnapshot['state']): Sprite {
    return new Sprite({
        image,
        sourceView: {
            height: 16,
            width: 16,
            x: state === 'open' ? 48 : 0,
            y: 0,
        },
    })
}
