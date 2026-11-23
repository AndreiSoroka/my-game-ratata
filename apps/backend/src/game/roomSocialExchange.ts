import type {
    AgentDecision,
    ExchangeClientMessage,
    ExchangeSnapshot,
} from '@my-game-ratata/contracts'

import type { NpcAiCoordinator } from '../ai/coordinator'
import type { AdventureService } from './adventure'
import type { AgentDecisionResult } from './agentDecisions'
import type { GameCharacter } from './character'
import { ExchangeService } from './exchange'
import {
    considersItems,
    NpcExchangeDiscussion,
    offeredItems,
} from './npcExchangeDiscussion'
import { npcDialogueMode } from './npcRoster'
import type { GameRoom } from './room'
import type { NpcHeardSpeech } from './roomNpcConversations'
import type { createSocialWake } from './roomSocialWake'

export function isExchange(message: {
    type: string
}): message is ExchangeClientMessage {
    return message.type.startsWith('exchange_')
}

export function createRoomExchange(
    room: GameRoom,
    adventure: AdventureService,
    ai: () => NpcAiCoordinator | undefined,
    wake: ReturnType<typeof createSocialWake>
) {
    const service = createExchangeService(room, adventure, ai, wake)
    const discussion = new NpcExchangeDiscussion()
    const acceptanceProblem = (
        actor: GameCharacter,
        decision: AgentDecision
    ) =>
        decision.type === 'exchange_accept' && considersItems(actor.id)
            ? discussion.problem(actor, service.snapshot(actor.id))
            : undefined
    return {
        service,
        acceptanceProblem,
        recordSpeech: (
            speaker: GameCharacter,
            recipient: GameCharacter,
            event: NpcHeardSpeech
        ): NpcHeardSpeech =>
            considersItems(recipient.id)
                ? discussion.recordSpeech(
                      recipient,
                      speaker,
                      service.snapshot(recipient.id),
                      event
                  )
                : event,
        recordInquiry: (
            actor: GameCharacter,
            event: NpcHeardSpeech,
            text: string
        ): void => {
            if (event.exchangeOffer !== undefined) {
                discussion.recordInquiry(
                    actor,
                    event,
                    text,
                    service.snapshot(actor.id)
                )
            }
        },
        notifyChange(
            actor: GameCharacter,
            exchange: ExchangeSnapshot,
            now: number
        ): void {
            const offer = considersItems(actor.id)
                ? offeredItems(exchange)
                : undefined
            const prompt =
                offer === undefined
                    ? undefined
                    : discussion.problem(actor, exchange)
            wake(
                actor.id,
                exchange.partnerId,
                prompt ??
                    'Изменились подтверждённые сервером условия обмена. Проверь их и реши следующий шаг.',
                now,
                offer
            )
        },
        decide(
            actor: GameCharacter,
            decision: ExchangeClientMessage,
            now: number
        ) {
            const problem = acceptanceProblem(actor, decision)
            return problem === undefined
                ? decideSocialExchange(service, actor, decision, now)
                : { accepted: false, error: problem, events: [] }
        },
    }
}

function createExchangeService(
    room: GameRoom,
    adventure: AdventureService,
    ai: () => NpcAiCoordinator | undefined,
    wake: ReturnType<typeof createSocialWake>
): ExchangeService {
    return new ExchangeService({
        getCharacter: (id) => room.getCharacter(id),
        navigationFor: (actor) => room.navigationFor(actor),
        aiDialogue: (actor) =>
            ai()?.configured(actor.id) === true &&
            npcDialogueMode(actor.id) !== 'passive',
        canControlAI: (actor, now) => ai()?.canControl(actor.id, now) === true,
        walletFor: (id) => adventure.walletFor(id),
        onInvite: (actorId, partnerId, _id, now) =>
            wake(
                partnerId,
                actorId,
                'Приглашение к добровольному обмену. Проверь окно обмена и реши, согласиться ли.',
                now
            ),
        onInvitationAccepted: (inviterId, inviteeId, now) => {
            if (ai()?.configured(inviterId) === true) {
                wake(
                    inviterId,
                    inviteeId,
                    'Собеседник принял твоё приглашение к обмену. Проверь текущие условия и реши следующий шаг.',
                    now
                )
            }
        },
    })
}

function decideSocialExchange(
    exchanges: ExchangeService,
    actor: GameCharacter,
    decision: ExchangeClientMessage,
    now: number
): AgentDecisionResult {
    if (decision.type === 'exchange_cancel') {
        const exchange = exchanges.snapshot(actor.id)
        if (
            exchange?.id === decision.exchangeId &&
            exchange.status === 'active'
        ) {
            return {
                ...exchanges.handle(
                    actor,
                    {
                        type: 'exchange_decline',
                        exchangeId: exchange.id,
                        revision: exchange.revision,
                        reason: 'Пока не согласен с условиями. Можно предложить другие.',
                    },
                    now
                ),
                events: [],
            }
        }
    }
    return { ...exchanges.handle(actor, decision, now), events: [] }
}
