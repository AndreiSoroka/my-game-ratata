import {
    DEFAULT_QUEST_REWARD_MODE,
    type NpcQuestClientMessage,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { snapshotItem } from './inventory'
import { acceptGenerated } from './npcQuestGeneratedAcceptance'
import type { NpcQuestResult } from './npcQuests'
import {
    type NpcQuestEnvironment,
    type NpcQuestRecord,
    questOfferAvailable,
    type QuestOfferRecord,
    questResult,
} from './npcQuestTypes'
import { validateQuestDraft } from './npcQuestValidation'
import { validateQuestExcursion } from './questExcursions'
import type { RewardReservations } from './rewardReservations'

export interface QuestAcceptanceContext {
    environment: NpcQuestEnvironment
    offers: Map<string, QuestOfferRecord>
    jobs: Map<string, NpcQuestRecord>
    reservations: RewardReservations
    cancel: (job: NpcQuestRecord, notice: string) => void
    refresh: (job: NpcQuestRecord) => void
}
function availableOffer(
    context: QuestAcceptanceContext,
    actor: GameCharacter,
    message: Extract<NpcQuestClientMessage, { type: 'quest_offer_answer' }>,
    now: number
): [QuestOfferRecord, GameCharacter] | undefined {
    const offer = context.offers.get(actor.id)
    const issuer = context.environment.getCharacter(offer?.view.issuerId ?? '')
    if (
        offer?.view.id !== message.offerId ||
        offer.view.revision !== message.revision ||
        issuer === undefined ||
        !questOfferAvailable(offer, context.environment, now)
    ) {
        return undefined
    }
    return [offer, issuer]
}

export function answerQuestOffer(
    context: QuestAcceptanceContext,
    actor: GameCharacter,
    message: Extract<NpcQuestClientMessage, { type: 'quest_offer_answer' }>,
    now: number
): NpcQuestResult {
    const available = availableOffer(context, actor, message, now)
    if (available === undefined) {
        return questResult(
            false,
            'Предложение устарело или заменено. Проверьте актуальные условия.'
        )
    }
    const [offer, issuer] = available
    if (!message.accept) {
        context.offers.delete(actor.id)
        return questResult(true)
    }
    const excursionError =
        offer.draft === null
            ? null
            : validateQuestExcursion(actor, offer.draft, context.environment)
    if (excursionError !== null) {
        return questResult(false, excursionError)
    }
    const group = context.environment.parties.contractGroup(actor.id)
    if (!offerTermsUnchanged(offer, issuer, context.environment)) {
        return questResult(
            false,
            'Условия или состояние обещанной награды изменились. Попросите новое предложение.'
        )
    }
    if (
        offer.view.authoredQuestId === undefined &&
        (group.leaderId !== actor.id || group.occupied)
    ) {
        return questResult(
            false,
            'Лидер должен сначала завершить действующий договор.'
        )
    }
    return (
        acceptSpecialOffer(context, actor, issuer, offer, message, now) ??
        acceptGenerated(
            context,
            actor,
            issuer,
            offer,
            message.rewardMode ?? DEFAULT_QUEST_REWARD_MODE,
            now
        )
    )
}

function acceptSpecialOffer(
    context: QuestAcceptanceContext,
    actor: GameCharacter,
    issuer: GameCharacter,
    offer: QuestOfferRecord,
    message: Extract<NpcQuestClientMessage, { type: 'quest_offer_answer' }>,
    now: number
): NpcQuestResult | undefined {
    if (offer.boardGuildId !== undefined) {
        const outcome = context.environment.parties.acceptBoardGuild(
            actor,
            offer.boardGuildId,
            issuer,
            message.rewardMode ?? DEFAULT_QUEST_REWARD_MODE,
            now
        )
        if (outcome.accepted) {
            context.offers.delete(actor.id)
        }
        return outcome
    }
    if (offer.view.authoredQuestId !== undefined) {
        const error = context.environment.adventure.storyOfferError(
            issuer,
            actor.id,
            offer.view.authoredQuestId
        )
        if (error !== undefined) {
            return questResult(false, error)
        }
        const accepted = context.environment.adventure.acceptStoryOffer(
            actor,
            offer.view.authoredQuestId,
            message.rewardMode ?? DEFAULT_QUEST_REWARD_MODE
        )
        if (accepted) {
            context.offers.delete(actor.id)
        }
        return questResult(
            accepted,
            accepted ? null : 'Городской заказ уже недоступен.'
        )
    }
    return offer.view.workerRequestId === undefined
        ? undefined
        : acceptWorkerOffer(context, actor, issuer, offer, message, now)
}

function acceptWorkerOffer(
    context: QuestAcceptanceContext,
    actor: GameCharacter,
    issuer: GameCharacter,
    offer: QuestOfferRecord,
    message: Extract<NpcQuestClientMessage, { type: 'quest_offer_answer' }>,
    now: number
): NpcQuestResult {
    const events = context.environment.parties.acceptNegotiatedWorker(
        actor,
        offer.view.workerRequestId ?? '',
        {
            rewardGold: offer.view.rewardGold,
            rewardItems: offer.view.rewardItems.map((item) => ({
                instanceId: item.instanceId,
                quantity: item.quantity ?? 1,
            })),
            issuerId: issuer.id,
            fundingCityId: offer.view.fundingCityId ?? issuer.locationId,
        },
        message.rewardMode ?? DEFAULT_QUEST_REWARD_MODE,
        context.environment.characters(),
        now
    )
    const accepted =
        context.environment.parties.snapshot(actor.id).activeJob?.id ===
        offer.view.workerRequestId
    if (accepted) {
        context.offers.delete(actor.id)
    }
    return {
        accepted,
        error: accepted ? null : 'Обращение уже принято или недоступно.',
        events,
    }
}

function rewardUnchanged(
    offer: QuestOfferRecord,
    issuer: GameCharacter
): boolean {
    return offer.view.rewardItems.every((promised) => {
        const item = issuer.inventory.find(
            (entry) => entry.instanceId === promised.instanceId
        )
        return (
            item !== undefined &&
            JSON.stringify({
                ...snapshotItem(item),
                quantity: promised.quantity ?? 1,
            }) ===
                JSON.stringify({
                    ...promised,
                    quantity: promised.quantity ?? 1,
                })
        )
    })
}

function offerTermsUnchanged(
    offer: QuestOfferRecord,
    issuer: GameCharacter,
    environment: NpcQuestEnvironment
): boolean {
    return (
        rewardUnchanged(offer, issuer) &&
        (offer.draft === null ||
            validateQuestDraft(issuer, offer.draft, environment) === null)
    )
}
