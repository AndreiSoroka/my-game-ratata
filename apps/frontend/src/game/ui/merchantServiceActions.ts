import {
    BASE_STOCK_MERCHANT_IDS,
    type CharacterSnapshot,
    CITY_HERB_COLLECTOR_IDS,
    type MerchantServiceView,
    workshopFor,
} from '@my-game-ratata/contracts'

import { characterName, tGame } from '@/shared/lib/i18n'

import type { InteractionAction } from './nearbyInteractionActions'
export function merchantServiceActions(target: CharacterSnapshot): InteractionAction[] {
    const workshop = workshopFor(target.id)
    const services: (MerchantServiceView | 'sell')[] = []
    if (workshop || BASE_STOCK_MERCHANT_IDS.includes(target.id)) services.push('shop')
    if (CITY_HERB_COLLECTOR_IDS.includes(target.id)) services.push('sell')
    if (workshop) services.push('orders')
    if (workshop?.repair) services.push('repair')
    const labels = {
        shop: tGame('game.world.buy'),
        sell: tGame('game.trade.sell'),
        orders: tGame('game.world.order'),
        repair: tGame('game.conversation.repairs'),
    }
    return services.map((service) => ({
        id: `service:${target.id}:${service}`,
        label: `${labels[service]}: ${characterName(target.id, target.nickname)}`,
        command: { type: 'interact', targetId: target.id, service },
    }))
}
