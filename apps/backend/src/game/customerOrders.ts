import {
    type AdventureRecipe,
    type CraftOrderClientMessage,
    type CraftOrderSnapshot,
    ITEM_DEFINITIONS,
    type MarketSnapshot,
    workshopFor,
    type WorkshopSnapshot,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import type { MarketResult } from './cityEconomy'
import type { CityState } from './cityEconomyStock'
import {
    activeCustomerOrder,
    type CustomerOrder,
    ok,
    orderPrice,
    orderRecipe,
    orderSnapshot,
    reject,
    releaseCustomerOrder,
} from './craftOrderState'
import { addInventoryItems, type InventoryItemInstance } from './inventory'
import { resetMartyrStreak } from './martyr'

/** Customer ownership and the actual reserved item outlive the owner's character record. */
export class CustomerOrders {
    private readonly orders = new Map<string, CustomerOrder>()
    private nextId = 1
    public constructor(
        private readonly getCity: (id: string) => CityState | undefined,
        private readonly market: (
            cityId: string,
            now: number
        ) => MarketSnapshot | undefined
    ) {}

    public snapshot(ownerId: string): CraftOrderSnapshot[] {
        return [...this.orders.values()]
            .filter((order) => order.ownerId === ownerId)
            .map(orderSnapshot)
    }
    public workshopSnapshot(
        ownerId: string,
        npcId: string,
        now: number
    ): WorkshopSnapshot | undefined {
        const workshop = workshopFor(npcId)
        if (workshop === undefined) {
            return undefined
        }
        const market = this.market(workshop.cityId, now)
        const active = this.hasActive(ownerId, npcId)
        return {
            npcId,
            orders: this.snapshot(ownerId).filter(
                (order) => order.npcId === npcId
            ),
            offers: workshop.items.flatMap((itemId) => {
                const row = market?.rows.find(
                    (candidate) => candidate.itemId === itemId
                )
                const fullPrice = orderPrice(market, itemId)
                if (row === undefined || fullPrice === undefined) {
                    return []
                }
                const deposit = Math.ceil(fullPrice / 2)
                return [
                    {
                        itemId,
                        label: ITEM_DEFINITIONS[itemId].name,
                        stock: row.stock,
                        fullPrice,
                        deposit,
                        remaining: fullPrice - deposit,
                        canOrder: row.stock === 0 && !active,
                    },
                ]
            }),
        }
    }
    public handle(
        actor: GameCharacter,
        wallet: PlayerAdventure,
        message: CraftOrderClientMessage,
        now: number
    ): MarketResult {
        this.update(now)
        if (message.type === 'craft_order_place') {
            return this.place(actor, wallet, message, now)
        }
        const order = this.orders.get(message.orderId)
        if (order?.ownerId !== actor.id || order.npcId !== message.npcId) {
            return reject('Этот заказ тебе не принадлежит.')
        }
        if (message.type === 'craft_order_claim') {
            return this.claim(actor, wallet, order, message.expectedRemaining)
        }
        if (!activeCustomerOrder(order)) {
            return reject('Этот заказ уже завершён.')
        }
        order.status = 'cancelled'
        if (order.output !== undefined) {
            this.release(order, now)
        }
        return ok()
    }
    public update(now: number): void {
        for (const order of this.orders.values()) {
            if (
                order.output !== undefined &&
                order.releaseAt !== undefined &&
                now >= order.releaseAt
            ) {
                this.release(order, now)
            } else if (
                !order.started &&
                activeCustomerOrder(order) &&
                order.status !== 'ready'
            ) {
                order.status =
                    orderRecipe(order, this.getCity(order.cityId)) === undefined
                        ? 'waiting_materials'
                        : 'queued'
            }
        }
    }
    public retire(ownerId: string, now: number): void {
        for (const order of this.orders.values()) {
            if (
                order.ownerId !== ownerId ||
                !activeCustomerOrder(order) ||
                order.releaseAt !== undefined
            ) {
                continue
            }
            order.releaseAt = now + 600_000
            if (!order.started && order.output === undefined) {
                order.status = 'cancelled'
            }
        }
    }
    public hasPriority(npcId: string): boolean {
        return this.next(npcId) !== undefined
    }
    public next(
        npcId: string
    ): { id: string; recipe: AdventureRecipe } | undefined {
        for (const order of this.orders.values()) {
            if (
                order.npcId !== npcId ||
                !activeCustomerOrder(order) ||
                order.status === 'ready' ||
                order.started
            ) {
                continue
            }
            const recipe = orderRecipe(order, this.getCity(order.cityId))
            if (recipe !== undefined) {
                return { id: order.id, recipe }
            }
        }
        return undefined
    }
    public started(orderId: string): void {
        const order = this.orders.get(orderId)
        if (order !== undefined) {
            order.started = true
            order.status = 'queued'
        }
    }
    public retry(orderId: string): void {
        const order = this.orders.get(orderId)
        if (order === undefined) {
            return
        }
        order.started = false
        if (order.releaseAt !== undefined) {
            order.status = 'cancelled'
        } else if (activeCustomerOrder(order)) {
            order.status = 'waiting_materials'
        }
    }
    public complete(
        orderId: string,
        item: InventoryItemInstance,
        now: number
    ): boolean {
        const order = this.orders.get(orderId)
        if (
            order === undefined ||
            order.output !== undefined ||
            order.itemId !== item.itemId
        ) {
            return false
        }
        order.output = item
        order.started = false
        if (
            order.status === 'cancelled' ||
            (order.releaseAt !== undefined && now >= order.releaseAt)
        ) {
            this.release(order, now)
        } else {
            order.status = 'ready'
        }
        return true
    }
    private hasActive(ownerId: string, npcId: string): boolean {
        return [...this.orders.values()].some(
            (order) =>
                order.ownerId === ownerId &&
                order.npcId === npcId &&
                activeCustomerOrder(order)
        )
    }
    private place(
        actor: GameCharacter,
        wallet: PlayerAdventure,
        message: Extract<
            CraftOrderClientMessage,
            { type: 'craft_order_place' }
        >,
        now: number
    ): MarketResult {
        const workshop = workshopFor(message.npcId)
        if (
            workshop?.cityId !== actor.locationId ||
            !workshop.items.includes(message.itemId)
        ) {
            return reject('Мастер не принимает такие заказы.')
        }
        const market = this.market(workshop.cityId, now)
        const row = market?.rows.find(
            (candidate) => candidate.itemId === message.itemId
        )
        if (row?.stock !== 0) {
            return reject(
                'Готовый товар есть в продаже. Заказ нужен только при отсутствии товара.'
            )
        }
        if (this.hasActive(actor.id, message.npcId)) {
            return reject(
                'Сначала забери или отмени текущий заказ у этого мастера.'
            )
        }
        const fullPrice = orderPrice(market, message.itemId)
        if (fullPrice === undefined || fullPrice !== message.expectedTotal) {
            return reject('Цена изменилась. Проверь новое предложение.')
        }
        const deposit = Math.ceil(fullPrice / 2)
        if (wallet.gold < deposit) {
            return reject('Недостаточно золотых для предоплаты.')
        }
        const order: CustomerOrder = {
            id: `craft-order-${String(this.nextId++)}`,
            ownerId: actor.id,
            npcId: message.npcId,
            cityId: workshop.cityId,
            itemId: message.itemId,
            status: 'waiting_materials',
            fullPrice,
            deposit,
            remaining: fullPrice - deposit,
            createdAt: now,
            started: false,
        }
        if (orderRecipe(order, this.getCity(workshop.cityId)) !== undefined) {
            order.status = 'queued'
        }
        wallet.gold -= deposit
        this.orders.set(order.id, order)
        return ok()
    }
    private claim(
        actor: GameCharacter,
        wallet: PlayerAdventure,
        order: CustomerOrder,
        expectedRemaining: number
    ): MarketResult {
        if (order.status !== 'ready' || order.output === undefined) {
            return reject('Заказ ещё не готов или уже выдан.')
        }
        if (order.remaining !== expectedRemaining) {
            return reject('Проверь остаток оплаты заказа.')
        }
        if (wallet.gold < order.remaining) {
            return reject('Недостаточно золотых для остатка оплаты.')
        }
        if (!addInventoryItems(actor.inventory, [order.output])) {
            return reject('Освободи место в рюкзаке. Заказ остаётся у мастера.')
        }
        resetMartyrStreak(actor)
        wallet.gold -= order.remaining
        delete order.output
        order.status = 'collected'
        return ok()
    }
    private release(order: CustomerOrder, now: number): void {
        releaseCustomerOrder(order, this.getCity(order.cityId), now)
    }
}
