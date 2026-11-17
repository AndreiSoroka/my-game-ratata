import type { QuestRewardShare } from '@my-game-ratata/contracts'

import {
    type AssetSettlementRequest,
    planAssetSettlement,
} from './assetSettlement'
import type { GameCharacter } from './character'
import { rewardEligible } from './guildRules'
import { itemQuantity } from './inventory'
import type { NpcQuestEnvironment, NpcQuestRecord } from './npcQuestTypes'
import { planQuestReward } from './questRewards'
import {
    type AssetWallet,
    availableInventoryQuantity,
} from './rewardReservations'

export function settleNpcQuest(
    job: NpcQuestRecord,
    submitter: GameCharacter,
    issuer: GameCharacter,
    wallet: AssetWallet,
    environment: NpcQuestEnvironment,
    now: number
): QuestRewardShare[] | undefined {
    const request = settlementRequest(
        job,
        submitter,
        issuer,
        wallet,
        environment
    )
    if (request === undefined) {
        return undefined
    }
    const plan = planAssetSettlement(request.assets)
    if (plan?.commit() !== true) {
        return undefined
    }
    for (const objective of job.draft.objectives) {
        if (
            objective.kind === 'deliver' &&
            objective.recipientId.startsWith('city:')
        ) {
            environment.adventure.economy.recordQuestDelivery(
                objective.recipientId.slice(5),
                objective.itemId,
                objective.quantity,
                now
            )
        }
    }
    return request.shares
}

function settlementRequest(
    job: NpcQuestRecord,
    submitter: GameCharacter,
    issuer: GameCharacter,
    wallet: AssetWallet,
    environment: NpcQuestEnvironment
): { assets: AssetSettlementRequest; shares: QuestRewardShare[] } | undefined {
    const roster = environment.parties.contractRoster(
        job.view.instanceId
    ).members
    const shares =
        job.view.rewardGold === 0
            ? []
            : planQuestReward({
                  receiptId: job.view.instanceId,
                  totalGold: job.view.rewardGold,
                  mode: job.view.rewardMode,
                  submitterId: submitter.id,
                  memberIds: [...roster].filter((id) =>
                      rewardEligible(id, roster, environment.getCharacter(id))
                  ),
              })
    if (shares === undefined) {
        return undefined
    }
    const assets: AssetSettlementRequest = {
        items: [],
        gold: shares
            .filter((share) => share.gold > 0)
            .map((share) => ({
                from: wallet,
                to: environment.adventure.walletFor(share.characterId),
                amount: share.gold,
            })),
        reservationId: job.view.instanceId,
    }
    const selected = new Map<string, number>()
    for (const objective of job.draft.objectives) {
        if (objective.kind !== 'deliver') {
            continue
        }
        const destination = objective.recipientId.startsWith('city:')
            ? environment.adventure.economy.questInventory(
                  objective.recipientId.slice(5)
              )
            : issuer.inventory
        const items = selectDelivery(
            submitter,
            objective.itemId,
            objective.quantity,
            selected
        )
        if (destination === undefined || items === undefined) {
            return undefined
        }
        assets.items.push({
            from: submitter.inventory,
            to: destination,
            items,
            ...(objective.recipientId.startsWith('city:')
                ? { capacity: Infinity }
                : {}),
        })
    }
    if (job.draft.rewardItems.length > 0) {
        assets.items.push({
            from: issuer.inventory,
            to: submitter.inventory,
            items: job.draft.rewardItems,
        })
    }
    return { assets, shares }
}

function selectDelivery(
    actor: GameCharacter,
    itemId: string,
    quantity: number,
    selected: Map<string, number>
) {
    const items: Array<{ instanceId: string; quantity: number }> = []
    let remaining = quantity
    for (const item of actor.inventory) {
        const free =
            Math.min(
                itemQuantity(item),
                availableInventoryQuantity(actor.inventory, item.instanceId)
            ) - (selected.get(item.instanceId) ?? 0)
        const amount =
            item.itemId === itemId ? Math.min(remaining, Math.max(0, free)) : 0
        if (amount > 0) {
            items.push({ instanceId: item.instanceId, quantity: amount })
            selected.set(
                item.instanceId,
                (selected.get(item.instanceId) ?? 0) + amount
            )
            remaining -= amount
        }
    }
    return remaining === 0 ? items : undefined
}
