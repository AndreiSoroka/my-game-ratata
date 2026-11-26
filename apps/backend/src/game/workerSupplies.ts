import { resolveAdventureNpc } from './adventureNpc'
import type { AdventureActionResult } from './adventureTrading'
import type { GameCharacter } from './character'
import type { CityEconomyService } from './cityEconomy'
import type { NavigationService } from './navigation'

export const supplyMerchantId = 'npc_merchant_1'

export function createWorkerDelivery(
    economy: () => CityEconomyService,
    allowed: (actor: GameCharacter) => boolean
) {
    return (
        actor: GameCharacter,
        merchant: GameCharacter | undefined,
        navigation: NavigationService,
        now: number
    ) =>
        allowed(actor)
            ? deliverLumberjackSupplies(
                  economy(),
                  actor,
                  merchant,
                  navigation,
                  now
              )
            : {
                  accepted: false,
                  error: 'Работа приостановлена до завершения обращения за помощью.',
                  events: [],
              }
}

function deliverLumberjackSupplies(
    economy: CityEconomyService,
    actor: GameCharacter,
    merchant: GameCharacter | undefined,
    navigation: NavigationService,
    now: number
): AdventureActionResult {
    if (
        !actor.tags.has('worker.lumberjack') ||
        !actor.tags.has(`worker.city.${actor.locationId}`) ||
        merchant === undefined ||
        resolveAdventureNpc(
            actor,
            supplyMerchantId,
            [merchant],
            now,
            navigation
        ) === undefined
    ) {
        return {
            accepted: false,
            error: 'Для сдачи припасов нужен живой городской торговец рядом.',
            events: [],
        }
    }
    const accepted = economy.depositSupplies(actor, 'lumberjack', now)
    return {
        accepted,
        error: accepted ? null : 'Нет припасов или места в городском запасе.',
        events: [],
    }
}
