import { type CharacterSnapshot, workshopFor } from '@my-game-ratata/contracts'

import { characterName, tGame } from '@/shared/lib/i18n'

import type { InteractionAction } from './nearbyInteractionActions'
export function merchantServiceActions(target: CharacterSnapshot): InteractionAction[] {
    const workshop = workshopFor(target.id)
    if (!workshop) return []
    const services = workshop.repair
        ? (['shop', 'orders', 'repair'] as const)
        : (['shop', 'orders'] as const)
    const labels = {
        shop: tGame('game.world.buy'),
        orders: tGame('game.world.order'),
        repair: tGame('game.conversation.repairs'),
    }
    return services.map((service) => ({
        id: `service:${target.id}:${service}`,
        label: `${labels[service]}: ${characterName(target.id, target.nickname)}`,
        command: { type: 'interact', targetId: target.id, service },
    }))
}
