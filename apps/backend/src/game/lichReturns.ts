import {
    CHEST_CAPACITY,
    type GameEventPayload,
    HERO_REVIVAL_WINDOW_MS,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import type { GameCharacter } from './character'
import { restoreCharacter } from './characterRecovery'
import {
    chestHasLineOfSight,
    chestOpenRefusal,
    type WorldChest,
} from './chestInteraction'
import { hasStar } from './constellations'
import { breakHeartSeal, watchHeartSeal } from './heartSeals'
import {
    addInventoryItems,
    createItemInstance,
    removeInventoryItem,
} from './inventory'
import { distance } from './math'
import { resourceOccupants } from './roomEconomy'
import { retainMasteryExperience } from './skillProgression'
import type { WorldLocations } from './worldLocations'

const lichDelayMs = 10 * 60_000

interface BoundHeart {
    locationId: string
    chest: WorldChest
    instanceId: string
    death?: { sequence: number; returnsAt: number; lootSettled: boolean }
}

export class LichReturns {
    private readonly hearts = new Map<GameCharacter, BoundHeart>()

    public constructor(
        private readonly world: () => WorldLocations,
        private readonly characters: ReadonlyMap<string, GameCharacter>,
        private readonly onEvents: (events: GameEventPayload[]) => void
    ) {}

    public bind(
        actor: GameCharacter,
        chestId: string,
        context: AbilityContext
    ): GameEventPayload[] {
        if (
            actor.progression.masteries.prayer_grave.level < 9 ||
            !hasStar(actor, 'prayer_grave.heart') ||
            !actor.mortal
        ) {
            return abilityNotice(
                actor,
                'Сердце лича открывается на девятом уровне Праха.'
            )
        }
        if (this.hearts.has(actor)) {
            return abilityNotice(actor, 'Твоё сердце уже связано с сундуком.')
        }
        const chest = this.world()
            .get(actor.locationId)
            .inventory.containers.ritualChest(chestId)
        if (chest === undefined) {
            return abilityNotice(actor, 'Для обряда нужен обычный сундук.')
        }
        const refusal = chestOpenRefusal(
            actor,
            chest.position,
            context.navigation,
            actor.locationId,
            context.now,
            chest.bounds
        )
        if (refusal !== undefined) {
            return abilityNotice(actor, refusal)
        }

        const heart = createItemInstance('lich_heart')
        if (!addInventoryItems(chest.contents, [heart], CHEST_CAPACITY)) {
            return abilityNotice(actor, 'В сундуке нет места.')
        }
        actor.lichHeartBound = true
        this.hearts.set(actor, {
            chest,
            instanceId: heart.instanceId,
            locationId: actor.locationId,
        })
        watchHeartSeal(chest, heart.instanceId, () => {
            this.hearts.delete(actor)
            actor.lichHeartBound = false
            actor.lichReturnAt = undefined
        })
        return abilityNotice(
            actor,
            'Сердце связано с сундуком. Оно позовёт тебя через десять минут после гибели.'
        )
    }

    public cancel(actor: GameCharacter): void {
        const heart = this.hearts.get(actor)
        if (heart !== undefined) {
            breakHeartSeal(heart.chest, heart.instanceId)
        }
    }

    /** True while this dead identity must remain available for its bound heart. */
    public advance(actor: GameCharacter, now: number): boolean {
        const heart = this.hearts.get(actor)
        if (heart === undefined) {
            return false
        }
        if (actor.alive) {
            delete heart.death
            actor.lichReturnAt = undefined
            return false
        }
        const location = this.world().get(heart.locationId)
        const chest = location.inventory.containers.ritualChest(heart.chest.id)
        if (
            chest !== heart.chest ||
            !chest.contents.some(
                ({ instanceId }) => instanceId === heart.instanceId
            )
        ) {
            this.cancel(actor)
            return false
        }
        if (actor.reviveUntil <= 0) {
            return false
        }
        if (heart.death?.sequence !== actor.deathSequence) {
            heart.death = {
                sequence: actor.deathSequence,
                returnsAt:
                    actor.reviveUntil - HERO_REVIVAL_WINDOW_MS + lichDelayMs,
                lootSettled: false,
            }
        }
        const death = heart.death
        actor.lichReturnAt = death.returnsAt
        if (now < actor.reviveUntil) {
            return true
        }
        if (!death.lootSettled) {
            death.lootSettled = true
            this.world().closeChestViews(actor.id)
            this.onEvents(
                this.world()
                    .get(actor.locationId)
                    .inventory.finalizeDeath(actor, now, false, {
                        ashRemains: false,
                    })
            )
        }
        return now < death.returnsAt || !this.returnToHeart(actor, heart, now)
    }

    private returnToHeart(
        actor: GameCharacter,
        heart: BoundHeart,
        now: number
    ): boolean {
        const position = this.returnPosition(heart.locationId, heart.chest)
        if (
            position === undefined ||
            removeInventoryItem(heart.chest.contents, heart.instanceId) ===
                undefined
        ) {
            return false
        }

        this.cancel(actor)
        retainMasteryExperience(actor, 7n, 10n)
        actor.lich = true
        actor.tags.add('state.lich')
        restoreCharacter(actor, now, true)
        actor.locationId = heart.locationId
        actor.position = position
        this.onEvents([
            {
                kind: 'revive',
                actorId: actor.id,
                targetId: actor.id,
                abilityId: 'ash_heart',
            },
        ])
        return true
    }

    private returnPosition(locationId: string, chest: WorldChest) {
        const { navigation } = this.world().get(locationId)
        const origin = navigation.worldToTile(chest.position)
        const occupants = resourceOccupants(this.world(), locationId)
        const actors = [...this.characters.values()].filter(
            (actor) => actor.alive && actor.locationId === locationId
        )
        const safe = navigation.findWalkableTileNear(origin, (tile) => {
            if (
                Math.max(
                    Math.abs(tile.x - origin.x),
                    Math.abs(tile.y - origin.y)
                ) > 3
            ) {
                return false
            }
            const point = navigation.tileToWorld(tile)
            return (
                actors.every(
                    (actor) =>
                        distance(actor.position, point) >=
                        navigation.grid.tileWidth
                ) &&
                occupants.every(
                    (bounds) =>
                        point.x < bounds.x ||
                        point.x >= bounds.x + bounds.width ||
                        point.y < bounds.y ||
                        point.y >= bounds.y + bounds.height
                ) &&
                chestHasLineOfSight(point, chest.position, navigation)
            )
        })
        return safe === undefined ? undefined : navigation.tileToWorld(safe)
    }
}
