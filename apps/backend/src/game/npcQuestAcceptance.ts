import {
    DEFAULT_QUEST_REWARD_MODE,
    type NpcQuestClientMessage,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { onCharacterDeath } from './characterDeathObservers'
import { snapshotItem } from './inventory'
import type { NpcQuestResult } from './npcQuests'
import {
    movementFingerprint,
    type NpcQuestEnvironment,
    type NpcQuestRecord,
    questContact,
    type QuestOfferRecord,
} from './npcQuestTypes'
import { validateQuestDraft } from './npcQuestValidation'
import { validateQuestExcursion } from './questExcursions'
import type { AssetWallet, RewardReservations } from './rewardReservations'

interface QuestAcceptanceContext {
    environment: NpcQuestEnvironment
    offers: Map<string, QuestOfferRecord>
    jobs: Map<string, NpcQuestRecord>
    reservations: RewardReservations
    rewardWallet: (
        offer: Pick<QuestOfferRecord, 'view'>,
        issuer: GameCharacter
    ) => AssetWallet | undefined
    newId: (prefix: string) => string
    cancel: (job: NpcQuestRecord, notice: string) => void
    refresh: (job: NpcQuestRecord) => void
}
function questResult(
    accepted: boolean,
    error: string | null = null
): NpcQuestResult {
    return { accepted, error, events: [] }
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
        offer.view.expiresAt <= now ||
        !questContact(actor, issuer, context.environment, now)
    ) {
        return undefined
    }
    return issuer.deathSequence === offer.issuerDeath
        ? [offer, issuer]
        : undefined
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
    if (group.leaderId !== actor.id || group.occupied) {
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

function acceptGenerated(
    context: QuestAcceptanceContext,
    actor: GameCharacter,
    issuer: GameCharacter,
    offer: QuestOfferRecord,
    rewardMode: import('@my-game-ratata/contracts').QuestRewardMode,
    now: number
): NpcQuestResult {
    const draft = offer.draft
    const wallet = context.rewardWallet(offer, issuer)
    const id = context.newId('contract')
    const group = context.environment.parties.contractGroup(actor.id)
    if (
        draft === null ||
        wallet === undefined ||
        !context.reservations.reserve(
            id,
            { inventory: issuer.inventory, wallet },
            draft.rewardGold,
            draft.rewardItems
        )
    ) {
        return questResult(
            false,
            'Награда больше недоступна. Попросите новые условия.'
        )
    }
    if (!context.environment.parties.contractSlots.claim(group.key, id)) {
        context.reservations.release(id)
        return questResult(false, 'У группы уже есть действующий договор.')
    }
    const job: NpcQuestRecord = {
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
    job.closeDeathListener = onCharacterDeath(issuer, () =>
        context.cancel(
            job,
            'Заказчик погиб. Договор отменён; резерв освобождён.'
        )
    )
    context.jobs.set(id, job)
    context.offers.delete(actor.id)
    context.refresh(job)
    return questResult(true)
}
