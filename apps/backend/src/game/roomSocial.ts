import type {
    AgentDecision,
    ClientMessage,
    GameEventPayload,
    NpcRequestStatus,
    SocialSnapshot,
} from '@my-game-ratata/contracts'

import type { NpcAiCoordinator } from '../ai/coordinator'
import type { AdventureService } from './adventure'
import type { AgentDecisionResult } from './agentDecisions'
import type { GameCharacter } from './character'
import { ExchangeService } from './exchange'
import { configureNpcQuestDialogue } from './npcQuestDialogue'
import { NpcQuestService } from './npcQuests'
import type { PartyService } from './parties'
import type { GameRoom } from './room'
import { RoomCommunication } from './roomCommunication'
import { handleSocialSpeech } from './roomSocialSpeech'
import { TradeNotifications } from './tradeNotifications'
import { WhisperService } from './whispers'
import { workerActivity } from './workerActivity'

export class RoomSocial {
    public readonly whispers: WhisperService
    public readonly exchanges: ExchangeService
    public readonly quests: NpcQuestService
    private readonly communication: RoomCommunication
    private sequence = 0
    private readonly tradeViews = new TradeNotifications()

    public constructor(
        private readonly room: GameRoom,
        private readonly adventure: AdventureService,
        parties: PartyService,
        private readonly ai: () => NpcAiCoordinator | undefined,
        actors: () => Iterable<GameCharacter>
    ) {
        this.communication = new RoomCommunication(room, ai)
        this.whispers = new WhisperService({
            getCharacter: (id) => room.getCharacter(id),
            navigationFor: (actor) => room.navigationFor(actor),
            heard: (actor, listener, message) =>
                this.ai()?.hear(
                    actor,
                    {
                        kind: 'message',
                        id: message.id,
                        senderId: actor.id,
                        text: message.text,
                        channel: 'whisper',
                        locationId: actor.locationId,
                        position: { ...actor.position },
                        at: message.at,
                    },
                    listener.id
                ),
        })
        this.exchanges = new ExchangeService({
            getCharacter: (id) => room.getCharacter(id),
            navigationFor: (actor) => room.navigationFor(actor),
            aiDialogue: (actor) => this.ai()?.configured(actor.id) === true,
            canControlAI: (actor, now) =>
                this.ai()?.canControl(actor.id, now) === true,
            walletFor: (id) => adventure.walletFor(id),
            onInvite: (actorId, partnerId, _id, now) =>
                this.wake(
                    partnerId,
                    actorId,
                    'Приглашение к добровольному обмену. Проверь окно обмена и реши, согласиться ли.',
                    now
                ),
        })
        this.quests = new NpcQuestService({
            adventure,
            parties,
            workers: room.workerRequests,
            characters: actors,
            getCharacter: (id) => room.getCharacter(id),
            navigationFor: (actor) => room.navigationFor(actor),
            canIssue: (actor) => this.ai()?.configured(actor.id) === true,
        })
        configureNpcQuestDialogue(
            adventure,
            this.quests,
            room.workerRequests,
            (id) => room.getCharacter(id)
        )
    }

    public handle(
        actor: GameCharacter,
        message: ClientMessage,
        now: number
    ): boolean {
        if (this.communication.handle(actor, message, now)) {
            return true
        }
        if (
            handleSocialSpeech(
                this.room,
                this.ai(),
                this.whispers,
                actor,
                message,
                now,
                (text) => this.notice(actor, text)
            )
        ) {
            return true
        }
        if (isExchange(message)) {
            const result = this.exchanges.handle(actor, message, now)
            if (!result.accepted) {
                this.notice(actor, result.error ?? 'Обмен недоступен.')
            }
            return true
        }
        if (
            message.type === 'quest_offer_answer' ||
            message.type === 'npc_quest_turn_in' ||
            message.type === 'npc_quest_abandon'
        ) {
            const result = this.quests.handle(actor, message, now)
            this.room.publishEvents(result.events)
            if (!result.accepted) {
                this.notice(actor, result.error ?? 'Договор недоступен.')
            }
            return true
        }
        return false
    }

    public isDecision(decision: AgentDecision): boolean {
        return (
            isExchange(decision) ||
            decision.type === 'quest_propose' ||
            decision.type === 'worker_quest_propose'
        )
    }

    public decide(
        actor: GameCharacter,
        decision: AgentDecision,
        now: number
    ): AgentDecisionResult {
        if (this.ai()?.canControl(actor.id, now) !== true) {
            return {
                accepted: false,
                error: 'Нет действующей аренды управления.',
                events: [],
            }
        }
        if (isExchange(decision)) {
            if (decision.type === 'exchange_cancel') {
                const exchange = this.exchanges.snapshot(actor.id)
                if (
                    exchange?.id === decision.exchangeId &&
                    exchange.status === 'active'
                ) {
                    return {
                        ...this.exchanges.handle(
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
            return {
                ...this.exchanges.handle(actor, decision, now),
                events: [],
            }
        }
        if (
            decision.type === 'quest_propose' ||
            decision.type === 'worker_quest_propose'
        ) {
            return this.quests.handleDecision(actor, decision, now)
        }
        return {
            accepted: false,
            error: 'Неизвестное общественное действие.',
            events: [],
        }
    }

    public workerActivity(id: string, now: number) {
        const actor = this.room.getCharacter(id)
        return actor === undefined
            ? undefined
            : workerActivity(
                  actor,
                  this.adventure,
                  this.room.workerRequests,
                  now
              )
    }

    public interactions(actor: GameCharacter) {
        return {
            aiDialogue: this.ai()?.configured(actor.id) === true,
            whisper: actor.soul.canSpeak,
            exchange:
                actor.soul.canSpeak &&
                (actor.controllerKind === 'network_player'
                    ? actor.connected
                    : this.ai()?.configured(actor.id) === true),
        }
    }

    public snapshot(actor: GameCharacter, now: number): SocialSnapshot {
        const exchange = this.exchanges.snapshot(actor.id)
        return {
            exchange,
            privateMessages: this.whispers.heardMessages(actor.id),
            ...this.communication.snapshot(actor, now),
            whisper: this.whispers.snapshot(actor, now, exchange?.partnerId),
            ...this.quests.snapshot(actor.id, now),
        }
    }

    public update(now: number, actors: Iterable<GameCharacter>): void {
        this.exchanges.pause(now)
        this.quests.update(now)
        for (const actor of actors) {
            if (this.ai()?.configured(actor.id) !== true) {
                continue
            }
            const exchange = this.exchanges.snapshot(actor.id)
            if (
                exchange !== null &&
                this.tradeViews.changed(actor.id, exchange)
            ) {
                this.wake(
                    actor.id,
                    exchange.partnerId,
                    'Изменились подтверждённые сервером условия обмена. Проверь их и реши следующий шаг.',
                    now
                )
            }
        }
    }

    public observe(events: GameEventPayload[]): void {
        this.quests.observe(events)
    }

    public reportNpcRequestStatus(
        requesterId: string,
        status: NpcRequestStatus
    ): void {
        this.communication.report(requesterId, status)
    }
    public stop(): void {
        this.exchanges.stop()
        this.quests.stop()
    }

    private wake(
        targetId: string,
        senderId: string,
        text: string,
        now: number
    ): void {
        const actor = this.room.getCharacter(senderId)
        if (actor === undefined) {
            return
        }
        this.ai()?.hear(
            actor,
            {
                kind: 'message',
                id: `social:${String(++this.sequence)}`,
                senderId,
                text,
                channel: 'whisper',
                system: true,
                locationId: actor.locationId,
                position: { ...actor.position },
                at: now,
            },
            targetId
        )
    }

    private notice(actor: GameCharacter, text: string): void {
        this.room.publishEvents([
            {
                kind: 'notice',
                actorId: actor.id,
                audienceIds: [actor.id],
                text,
            },
        ])
    }
}

function isExchange(message: {
    type: string
}): message is import('@my-game-ratata/contracts').ExchangeClientMessage {
    return message.type.startsWith('exchange_')
}
