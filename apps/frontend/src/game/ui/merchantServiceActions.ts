import {
    BASE_STOCK_MERCHANT_IDS,
    type CharacterSnapshot,
    type MerchantServiceView,
    workshopFor,
} from '@my-game-ratata/contracts'

import { characterName, tGame } from '@/shared/lib/i18n'

import type { InteractionAction } from './nearbyInteractionActions'
export function merchantServiceActions(target: CharacterSnapshot): InteractionAction[] {
    const workshop = workshopFor(target.id)
    const services: MerchantServiceView[] = []
    if (workshop || BASE_STOCK_MERCHANT_IDS.includes(target.id)) services.push('shop')
    if (workshop) services.push('orders')
    if (workshop?.repair) services.push('repair')
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
