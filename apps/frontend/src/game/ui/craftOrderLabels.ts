import type { CraftOrderSnapshot, CraftOrderStatus } from '@my-game-ratata/contracts'
export const craftOrderStatusLabels: Record<CraftOrderStatus, string> = {
    waiting_materials: 'Ждёт материалы',
    queued: 'В очереди',
    ready: 'Готов к получению',
    collected: 'Получен',
    cancelled: 'Отменён',
    released: 'Выставлен в открытую продажу',
}
export function craftOrderPaymentText(order: CraftOrderSnapshot): string {
    if (order.status === 'collected') return `Оплачено ${order.fullPrice} ◈`
    if (order.status === 'cancelled' || order.status === 'released')
        return `Аванс ${order.deposit} ◈ не возвращён`
    return `Внесено ${order.deposit} ◈ · осталось ${order.remaining} ◈`
}
