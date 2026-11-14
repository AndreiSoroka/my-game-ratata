import { type CharacterSnapshot, workshopFor } from '@my-game-ratata/contracts'

import type { InteractionAction } from './nearbyInteractionActions'
export function merchantServiceActions(target: CharacterSnapshot): InteractionAction[] {
    const workshop = workshopFor(target.id)
    if (!workshop) return []
    const services = workshop.repair
        ? (['shop', 'orders', 'repair'] as const)
        : (['shop', 'orders'] as const)
    const labels = { shop: 'Купить', orders: 'Заказать', repair: 'Ремонт' }
    return services.map((service) => ({
        id: `service:${target.id}:${service}`,
        label: `${labels[service]}: ${target.nickname}`,
        command: { type: 'interact', targetId: target.id, service },
    }))
}
