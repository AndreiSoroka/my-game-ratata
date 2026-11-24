import type {
    QuestDraft,
    QuestRewardMode,
    QuestRewardShare,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { onCharacterDeath } from './characterDeathObservers'
import type { QuestAcceptanceContext } from './npcQuestAcceptance'
import { questRewardWallet } from './npcQuestOfferAssets'
import { settleNpcQuest } from './npcQuestSettlement'
import {
    movementFingerprint,
    type NpcQuestRecord,
    type NpcQuestResult,
    questOfferAvailable,
    type QuestOfferRecord,
    questResult,
} from './npcQuestTypes'

export function acceptGenerated(
    context: QuestAcceptanceContext,
    actor: GameCharacter,
    issuer: GameCharacter,
    offer: QuestOfferRecord,
    rewardMode: QuestRewardMode,
    now: number
): NpcQuestResult {
    const draft = offer.draft
    const wallet = questRewardWallet(context.environment, offer, issuer)
    const id =
        offer.publication?.id ??
        context.environment.adventure.questFunding.newId('npc-contract')
    const group = context.environment.parties.contractGroup(actor.id)
    if (
        draft === null ||
        wallet === undefined ||
        !(offer.publication === undefined
            ? context.reservations.reserve(
                  id,
                  { inventory: issuer.inventory, wallet },
                  draft.rewardGold,
                  draft.rewardItems
              )
            : !context.jobs.has(id) && context.reservations.valid(id))
    ) {
        return questResult(
            false,
            'Награда больше недоступна. Попросите новые условия.'
        )
    }
    if (!context.environment.parties.contractSlots.claim(group.key, id)) {
        if (offer.publication === undefined) {
            context.reservations.release(id)
        }
        return questResult(false, 'У группы уже есть действующий договор.')
    }
    const job = buildJob(
        context,
        actor,
        issuer,
        offer,
        draft,
        id,
        rewardMode,
        now
    )
    job.closeDeathListener = onCharacterDeath(issuer, () =>
        context.cancel(
            job,
            'Заказчик погиб. Договор отменён; резерв освобождён.'
        )
    )
    if (offer.publication !== undefined) {
        offer.publication.status = 'claimed'
    }
    context.jobs.set(id, job)
    context.offers.delete(actor.id)
    context.refresh(job)
    return questResult(true)
}

export function redeemPublishedQuest(
    context: QuestAcceptanceContext,
    actor: GameCharacter,
    issuer: GameCharacter,
    offer: QuestOfferRecord,
    rewardMode: QuestRewardMode,
    now: number,
    complete: (job: NpcQuestRecord, shares: QuestRewardShare[]) => void
): NpcQuestResult {
    const { draft, publication } = offer
    const parties = context.environment.parties
    const group = parties.contractGroup(actor.id)
    const wallet = questRewardWallet(context.environment, offer, issuer)
    if (
        draft === null ||
        publication === undefined ||
        wallet === undefined ||
        !draft.objectives.every((objective) => objective.kind === 'deliver') ||
        !questOfferAvailable(offer, context.environment, now) ||
        context.jobs.has(publication.id) ||
        group.leaderId !== actor.id ||
        !parties.contractSlots.claim(group.key, publication.id)
    ) {
        return questResult(false, 'Этот заказ сейчас недоступен для сдачи.')
    }
    const job = buildJob(
        context,
        actor,
        issuer,
        offer,
        draft,
        publication.id,
        rewardMode,
        now
    )
    const shares = settleNpcQuest(
        job,
        actor,
        issuer,
        wallet,
        context.environment,
        now
    )
    if (shares === undefined) {
        parties.contractSlots.release(publication.id)
        return questResult(
            false,
            'Передача не состоялась: проверьте вещи, вместимость и награду.'
        )
    }
    publication.status = 'claimed'
    job.view.progress = draft.objectives.map((objective) => objective.quantity)
    context.jobs.set(publication.id, job)
    complete(job, shares)
    return questResult(true)
}

function buildJob(
    context: QuestAcceptanceContext,
    actor: GameCharacter,
    issuer: GameCharacter,
    offer: QuestOfferRecord,
    draft: QuestDraft,
    id: string,
    rewardMode: QuestRewardMode,
    now: number
): NpcQuestRecord {
    const group = context.environment.parties.contractGroup(actor.id)
    return {
        draft,
        acceptedBy: actor.id,
        acceptedAt: now,
        issuerDeath: issuer.deathSequence,
        baseline: new Map(
            [...group.members].flatMap((memberId) => {
                const member = context.environment.getCharacter(memberId)
                return member === undefined
                    ? []
                    : [[memberId, movementFingerprint(member)]]
            })
        ),
        receipts: new Set(
            [...context.environment.characters()].map(
                (character) =>
                    `death:${character.id}:${String(character.deathSequence)}`
            )
        ),
        view: {
            ...structuredClone(offer.view),
            instanceId: id,
            rewardMode,
            progress: draft.objectives.map(() => 0),
            status: 'active',
            notice: null,
        },
    }
}
