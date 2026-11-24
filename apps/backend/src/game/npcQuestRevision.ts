import type { NpcQuestDecision } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { questRewardWallet } from './npcQuestOfferAssets'
import {
    type NpcQuestEnvironment,
    questContact,
    type QuestOfferRecord,
} from './npcQuestTypes'
import { availableGold, availableInventoryQuantity } from './rewardReservations'

export type QuestRevision = Extract<
    NpcQuestDecision,
    { type: 'quest_offer_revise' }
>
interface Context {
    environment: NpcQuestEnvironment
    offers: ReadonlyMap<string, QuestOfferRecord>
}

/** One pure check covers model correction and the simulation-time commit. */
export function prepareQuestRevision(
    context: Context,
    issuer: GameCharacter,
    decision: QuestRevision,
    now: number
): QuestOfferRecord | string {
    const offer = currentRevision(context, issuer, decision, now)
    if (typeof offer === 'string') {
        return offer
    }
    if (offer.view.authoredQuestId !== undefined || offer.boardOffer === true) {
        return 'Условия общего городского заказа определены городом и не меняются.'
    }
    if (!validSelection(decision)) {
        return 'Некорректная награда.'
    }
    const wallet = questRewardWallet(context.environment, offer, issuer)
    return wallet === undefined ||
        availableGold(wallet) < decision.rewardGold ||
        !availableSelection(issuer, decision.rewardItems)
        ? 'У заказчика нет свободной награды для этих условий.'
        : offer
}

function currentRevision(
    context: Context,
    issuer: GameCharacter,
    decision: QuestRevision,
    now: number
): QuestOfferRecord | string {
    const offer = context.offers.get(decision.targetId)
    const target = context.environment.getCharacter(decision.targetId)
    if (
        offer === undefined ||
        target === undefined ||
        offer.view.id !== decision.offerId ||
        offer.view.issuerId !== issuer.id ||
        offer.view.revision !== decision.revision ||
        offer.view.expiresAt <= now ||
        issuer.deathSequence !== offer.issuerDeath ||
        !questContact(target, issuer, context.environment, now)
    ) {
        return 'Предложение или собеседник уже недоступны.'
    }
    return offer
}

function validSelection(decision: QuestRevision): boolean {
    return (
        Number.isSafeInteger(decision.rewardGold) &&
        decision.rewardGold >= 0 &&
        decision.rewardGold <= 300 &&
        decision.rewardItems.length <= 10 &&
        new Set(decision.rewardItems.map((item) => item.instanceId)).size ===
            decision.rewardItems.length
    )
}
function availableSelection(
    issuer: GameCharacter,
    selection: QuestRevision['rewardItems']
): boolean {
    return selection.every(
        (item) =>
            Number.isSafeInteger(item.quantity) &&
            item.quantity > 0 &&
            item.quantity <= 100 &&
            availableInventoryQuantity(issuer.inventory, item.instanceId) >=
                item.quantity
    )
}
