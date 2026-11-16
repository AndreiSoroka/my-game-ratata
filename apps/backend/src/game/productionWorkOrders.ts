import type {
    AdventureRecipe,
    AdventureRecipeId,
    MarketItemId,
    MarketRow,
    MarketSnapshot,
} from '@my-game-ratata/contracts'
import { workshopFor } from '@my-game-ratata/contracts'

import { adventureRecipes } from './adventureResources'
import type { GameCharacter } from './character'
import { type CityState } from './cityEconomyStock'
import type { CustomerOrders } from './customerOrders'
import {
    addInventoryItems,
    countInventoryItem,
    itemQuantity,
} from './inventory'
import { resetMartyrStreak } from './martyr'
import { distance } from './math'
import { issueProductionMaterials } from './productionMaterials'
import { canPerformSkillAction } from './skillProgression'

interface WorkOrder {
    itemId: MarketItemId
    recipeId: AdventureRecipeId
    outputInstanceId?: string
    customerOrderId?: string
    costs: AdventureRecipe['cost']
}

/** Inputs and output stay real inventory items, even after theft or the artisan's death. */
export class ProductionWorkOrders {
    private readonly orders = new Map<string, WorkOrder>()

    public constructor(
        private readonly getCity: (id: string) => CityState | undefined,
        private readonly snapshot: (
            cityId: string,
            now: number
        ) => MarketSnapshot | undefined,
        private readonly customers?: CustomerOrders
    ) {}

    public has(actorId: string): boolean {
        return this.orders.has(actorId)
    }

    public forget(actorId: string): void {
        const order = this.orders.get(actorId)
        if (order?.customerOrderId !== undefined) {
            this.customers?.retry(order.customerOrderId)
        }
        this.orders.delete(actorId)
    }

    public reconcile(actor: GameCharacter): void {
        const order = this.orders.get(actor.id)
        if (order === undefined) {
            return
        }
        const hasOutput = actor.inventory.some(
            (item) => item.instanceId === order.outputInstanceId
        )
        const hasInputs = Object.entries(order.costs).every(
            ([id, count]) =>
                countInventoryItem(actor.inventory, id as MarketItemId) >= count
        )
        if (
            !actor.alive ||
            actor.tags.has('state.retired') ||
            (order.outputInstanceId === undefined ? !hasInputs : !hasOutput)
        ) {
            this.forget(actor.id)
        }
    }

    /** Resolve costs/output from the shared recipe catalogue, never from controller data. */
    public start(
        actor: GameCharacter,
        requested: AdventureRecipe,
        now: number,
        customerOrderId?: string
    ): boolean {
        const recipe = adventureRecipes.find(
            (candidate) => candidate.id === requested.id
        )
        if (
            recipe === undefined ||
            !artisanRecipes(actor.id).includes(recipe.id) ||
            !atWorkshop(actor, now) ||
            this.orders.has(actor.id)
        ) {
            return false
        }
        const city = this.getCity(actor.locationId)
        const stock = this.snapshot(actor.locationId, now)?.rows.find(
            (row) => row.itemId === recipe.itemId
        )
        if (
            city === undefined ||
            !stockAllowsProduction(stock, customerOrderId)
        ) {
            return false
        }
        if (!issueProductionMaterials(city, actor, recipe)) {
            return false
        }
        this.orders.set(actor.id, {
            itemId: recipe.itemId,
            recipeId: recipe.id,
            ...(customerOrderId === undefined ? {} : { customerOrderId }),
            costs: { ...recipe.cost },
        })
        city.revision += 1
        if (customerOrderId !== undefined) {
            this.customers?.started(customerOrderId)
        }
        return true
    }

    public complete(actor: GameCharacter, now: number): boolean {
        const order = this.orders.get(actor.id)
        if (order === undefined || !atWorkshop(actor, now)) {
            return false
        }
        const produced = actor.inventory.find(
            (item) => item.instanceId === order.outputInstanceId
        )
        if (produced === undefined) {
            return false
        }
        if (order.customerOrderId !== undefined) {
            if (
                this.customers?.complete(
                    order.customerOrderId,
                    produced,
                    now
                ) !== true
            ) {
                return false
            }
            resetMartyrStreak(actor)
            actor.inventory.splice(actor.inventory.indexOf(produced), 1)
            this.orders.delete(actor.id)
            return true
        }
        const city = this.getCity(actor.locationId)
        const row = this.snapshot(actor.locationId, now)?.rows.find(
            (candidate) => candidate.itemId === order.itemId
        )
        if (
            city === undefined ||
            row === undefined ||
            row.stock + itemQuantity(produced) > row.capacity ||
            !addInventoryItems(city.inventory, [produced], Infinity)
        ) {
            return false
        }
        resetMartyrStreak(actor)
        actor.inventory.splice(actor.inventory.indexOf(produced), 1)
        city.history.push({
            at: now,
            itemId: order.itemId,
            quantity: itemQuantity(produced),
            kind: 'delivery',
        })
        city.revision += 1
        this.orders.delete(actor.id)
        return true
    }
    public recordCraftOutput(
        actor: GameCharacter,
        recipeId: AdventureRecipeId,
        instanceId: string
    ): void {
        const order = this.orders.get(actor.id)
        const item = actor.inventory.find(
            (candidate) => candidate.instanceId === instanceId
        )
        if (
            order?.recipeId !== recipeId ||
            item?.itemId !== order.itemId ||
            order.outputInstanceId !== undefined
        ) {
            return
        }
        order.outputInstanceId = instanceId
    }
    public startNext(
        actor: GameCharacter,
        now: number
    ): AdventureRecipeId | undefined {
        const paid = this.customers?.next(actor.id)
        if (paid !== undefined) {
            return this.start(actor, paid.recipe, now, paid.id)
                ? paid.recipe.id
                : undefined
        }
        if (this.customers?.hasPriority(actor.id) === true) {
            return undefined
        }
        return adventureRecipes.find(
            (recipe) =>
                artisanRecipes(actor.id).includes(recipe.id) &&
                this.start(actor, recipe, now)
        )?.id
    }
}

export function artisanRecipes(actorId: string): readonly string[] {
    return workshopFor(actorId)?.recipeIds ?? []
}

function atWorkshop(actor: GameCharacter, now: number): boolean {
    return (
        canPerformSkillAction(actor, now) &&
        actor.locationId === actor.spawnLocationId &&
        distance(actor.position, actor.spawnPosition) <= 48
    )
}

function stockAllowsProduction(
    stock: MarketRow | undefined,
    customerOrderId: string | undefined
): boolean {
    return (
        stock !== undefined &&
        (customerOrderId !== undefined || stock.stock < stock.target / 2)
    )
}
