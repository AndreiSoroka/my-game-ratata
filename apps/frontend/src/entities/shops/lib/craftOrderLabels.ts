import type { CraftOrderSnapshot, CraftOrderStatus } from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'
export const craftOrderStatusLabels: Record<CraftOrderStatus, string> = {
    get waiting_materials() {
        return tGame('game.world.waitingMaterials')
    },
    get queued() {
        return tGame('game.world.orderQueued')
    },
    get ready() {
        return tGame('game.world.orderReady')
    },
    get collected() {
        return tGame('game.world.orderCollected')
    },
    get cancelled() {
        return tGame('game.world.orderCancelled')
    },
    get released() {
        return tGame('game.world.orderReleased')
    },
}
export function craftOrderPaymentText(order: CraftOrderSnapshot): string {
    if (order.status === 'collected')
        return tGame('game.world.orderPaid', { price: order.fullPrice })
    if (order.status === 'cancelled' || order.status === 'released')
        return tGame('game.world.depositRetained', { deposit: order.deposit })
    return tGame('game.world.orderBalance', { deposit: order.deposit, remaining: order.remaining })
}
