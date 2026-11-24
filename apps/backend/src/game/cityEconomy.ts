import { CustomerOrders } from './customerOrders'
import { resetMartyrStreak } from './martyr'
import { ProductionWorkOrders } from './productionWorkOrders'
export { artisanRecipes } from './productionWorkOrders'
import {
    CITY_COMMODITIES,
    type CityState,
    periodMs,
    takeQuantity,
    transferQuantity,
} from './cityEconomyStock'
export { CITY_COMMODITIES } from './cityEconomyStock'
import {
    type AdventureRecipe,
    type AdventureRecipeId,
    getWorldLocationDefinition,
    ITEM_DEFINITIONS,
    type MarketClientMessage,
    type MarketRow,
    type MarketSnapshot,
    quoteMarketTrade,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { marketCapacity, prepareTrade, rejected } from './cityMarketRules'
import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
    type InventoryItemInstance,
} from './inventory'
import { QuestFunding } from './questFunding'
import { canPerformSkillAction } from './skillProgression'

export interface MarketResult {
    accepted: boolean
    error: string | null
}

/** Session-owned finite warehouses; snapshots and quotes never mutate stock. */
export class CityEconomyService {
    private readonly cities = new Map<string, CityState>()
    public questInventory(cityId: string): InventoryItemInstance[] | undefined {
        return this.cities.get(cityId)?.inventory
    }

    public recordQuestDelivery(
        cityId: string,
        itemId: import('@my-game-ratata/contracts').ItemId,
        quantity: number,
        now: number
    ): void {
        const city = this.cities.get(cityId)
        if (
            city === undefined ||
            !CITY_COMMODITIES.some((row) => row.itemId === itemId)
        ) {
            return
        }
        city.revision += 1
        city.history.push({
            at: now,
            itemId: itemId as import('@my-game-ratata/contracts').MarketItemId,
            quantity,
            kind: 'delivery',
        })
    }
    public readonly customerOrders = new CustomerOrders(
        (id) => this.cities.get(id),
        (id, now) => this.snapshot(id, now)
    )
    private readonly workOrders = new ProductionWorkOrders(
        (id) => this.cities.get(id),
        (id, now) => this.snapshot(id, now),
        this.customerOrders
    )

    public constructor(
        now = Date.now(),
        cityIds: readonly string[] = WORLD_LOCATION_DEFINITIONS.filter(
            (location) => location.biome === 'city'
        ).map((location) => location.id),
        private readonly questFunding = new QuestFunding(cityIds)
    ) {
        for (const cityId of cityIds) {
            const inventory: InventoryItemInstance[] = []
            for (const row of CITY_COMMODITIES) {
                addInventoryItems(
                    inventory,
                    [
                        createItemInstance(
                            row.itemId,
                            Math.floor(row.target / 2)
                        ),
                    ],
                    Infinity
                )
            }
            this.cities.set(cityId, {
                inventory,
                lastConsumptionAt: new Map(
                    CITY_COMMODITIES.map((row) => [row.itemId, now])
                ),
                revision: 0,
                history: [],
            })
        }
    }

    public update(now: number): void {
        this.customerOrders.update(now)
        for (const city of this.cities.values()) {
            for (const definition of CITY_COMMODITIES) {
                if (definition.consumption === 0) {
                    continue
                }
                const interval = periodMs / definition.consumption
                const previous =
                    city.lastConsumptionAt.get(definition.itemId) ?? now
                const intervals = Math.floor((now - previous) / interval)
                if (intervals <= 0) {
                    continue
                }
                const count = Math.min(
                    countInventoryItem(city.inventory, definition.itemId),
                    intervals
                )
                if (count > 0) {
                    takeQuantity(city.inventory, definition.itemId, count)
                    for (let index = 1; index <= count; index += 1) {
                        const at = previous + index * interval
                        if (at > now - periodMs) {
                            city.history.push({
                                at,
                                itemId: definition.itemId,
                                quantity: 1,
                                kind: 'consumption',
                            })
                        }
                    }
                    city.revision += 1
                }
                city.lastConsumptionAt.set(
                    definition.itemId,
                    previous + intervals * interval
                )
            }
            city.history = city.history.filter(
                (event) => event.at > now - periodMs
            )
        }
    }

    public snapshot(cityId: string, now: number): MarketSnapshot | undefined {
        const city = this.cities.get(cityId)
        if (city === undefined) {
            return undefined
        }
        return {
            cityId,
            cityName: getWorldLocationDefinition(cityId)?.name ?? cityId,
            revision: city.revision,
            rows: CITY_COMMODITIES.map((definition) => {
                const row: MarketRow = {
                    itemId: definition.itemId,
                    label: ITEM_DEFINITIONS[definition.itemId].name,
                    stock: countInventoryItem(
                        city.inventory,
                        definition.itemId
                    ),
                    target: definition.target,
                    capacity: definition.target * 2,
                    basePrice: definition.basePrice,
                    ...(definition.fixedPrice === true
                        ? { fixedPrice: true }
                        : {}),
                    consumptionPer10Minutes: definition.consumption,
                    buyPrice: null,
                    sellPrice: null,
                    deliveredLast10Minutes: 0,
                    consumedLast10Minutes: 0,
                }
                row.buyPrice = quoteMarketTrade(row, 'buy', 1)
                row.sellPrice = quoteMarketTrade(row, 'sell', 1)
                for (const event of city.history) {
                    if (
                        event.itemId !== row.itemId ||
                        event.at <= now - periodMs
                    ) {
                        continue
                    }
                    if (event.kind === 'delivery') {
                        row.deliveredLast10Minutes += event.quantity
                    } else {
                        row.consumedLast10Minutes += event.quantity
                    }
                }
                return row
            }),
        }
    }

    public trade(
        actor: GameCharacter,
        wallet: PlayerAdventure,
        message: Extract<MarketClientMessage, { type: 'market_trade' }>,
        now: number
    ): MarketResult {
        if (!canPerformSkillAction(actor, now)) {
            return rejected('Сейчас торговля недоступна.')
        }
        const city = this.cities.get(actor.locationId)
        const row = this.snapshot(actor.locationId, now)?.rows.find(
            (candidate) => candidate.itemId === message.itemId
        )
        if (city === undefined || row === undefined) {
            return rejected('В этой локации нет городского рынка.')
        }
        const plan = prepareTrade(
            wallet,
            message,
            row,
            this.questFunding,
            actor.locationId
        )
        if (typeof plan === 'string') {
            return rejected(plan)
        }
        const buying = message.side === 'buy'
        const source = buying ? city.inventory : actor.inventory
        const destination = buying ? actor.inventory : city.inventory
        if (
            !transferQuantity(
                source,
                destination,
                message.itemId,
                message.quantity,
                marketCapacity(message.side)
            )
        ) {
            return rejected(
                buying
                    ? 'В рюкзаке нет места.'
                    : 'В рюкзаке недостаточно этого товара.'
            )
        }
        resetMartyrStreak(actor)
        wallet.gold += buying ? -plan.total : plan.total
        plan.creditTax()
        city.revision += 1
        if (!buying) {
            city.history.push({
                at: now,
                itemId: message.itemId,
                quantity: message.quantity,
                kind: 'delivery',
            })
        }
        return { accepted: true, error: null }
    }

    public recordCraftOutput(
        actor: GameCharacter,
        recipeId: AdventureRecipeId,
        instanceId: string
    ): void {
        this.workOrders.recordCraftOutput(actor, recipeId, instanceId)
    }
    public startNextWork(
        actor: GameCharacter,
        now: number
    ): AdventureRecipeId | undefined {
        return this.workOrders.startNext(actor, now)
    }
    public hasWorkOrder(actorId: string): boolean {
        return this.workOrders.has(actorId)
    }
    public forgetActor(actorId: string): void {
        this.workOrders.forget(actorId)
    }
    public reconcileWorkOrder(actor: GameCharacter): void {
        this.workOrders.reconcile(actor)
    }
    public startWorkOrder(
        actor: GameCharacter,
        recipe: AdventureRecipe,
        now: number
    ): boolean {
        return this.workOrders.start(actor, recipe, now)
    }
    public completeWorkOrder(actor: GameCharacter, now: number): boolean {
        return this.workOrders.complete(actor, now)
    }
}
