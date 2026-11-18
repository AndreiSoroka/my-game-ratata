import type { GameCharacter } from './character'
import type { NpcQuestEnvironment, QuestOfferRecord } from './npcQuestTypes'
import {
    type AssetWallet,
    availableGold,
    availableInventoryQuantity,
} from './rewardReservations'

export function questRewardWallet(
    environment: NpcQuestEnvironment,
    offer: Pick<QuestOfferRecord, 'view'>,
    issuer: GameCharacter
): AssetWallet | undefined {
    return offer.view.funding === 'city' || offer.view.funding === 'worker'
        ? environment.adventure.questFunding.wallet(
              offer.view.fundingCityId ?? issuer.locationId
          )
        : environment.adventure.walletFor(issuer.id)
}

export function questOfferAssetError(
    environment: NpcQuestEnvironment,
    issuer: GameCharacter,
    offer: QuestOfferRecord
): string | undefined {
    const wallet = questRewardWallet(environment, offer, issuer)
    return wallet === undefined ||
        availableGold(wallet) < offer.view.rewardGold ||
        offer.view.rewardItems.some(
            (item) =>
                availableInventoryQuantity(issuer.inventory, item.instanceId) <
                (item.quantity ?? 1)
        )
        ? 'У меня сейчас нет свободной награды для такого обещания.'
        : undefined
}
