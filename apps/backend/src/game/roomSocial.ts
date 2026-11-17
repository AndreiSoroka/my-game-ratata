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
import { isNpcQuestClient, isNpcQuestDecision } from './npcQuestCommands'
import { configureNpcQuestDialogue } from './npcQuestDialogue'
import { NpcQuestService } from './npcQuests'
import type { PartyService } from './parties'
import type { GameRoom } from './room'
import { RoomCommunication } from './roomCommunication'
import { RoomQuestDialogues } from './roomQuestDialogues'
import { decideSocialExchange } from './roomSocialExchange'
import { handleSocialSpeech } from './roomSocialSpeech'
import { createSocialWake } from './roomSocialWake'
import { createWhisperObserver } from './roomWhisperObserver'
import { TradeNotifications } from './tradeNotifications'
import { WhisperService } from './whispers'
import { workerActivity } from './workerActivity'

export class RoomSocial {
    public readonly whispers: WhisperService
    public readonly exchanges: ExchangeService
    public readonly quests: NpcQuestService
    private readonly questDialogues: RoomQuestDialogues
    private readonly communication: RoomCommunication
    private readonly wake: ReturnType<typeof createSocialWake>
    private readonly tradeViews = new TradeNotifications()

    public constructor(
        private readonly room: GameRoom,
        private readonly adventure: AdventureService,
        parties: PartyService,
        private readonly ai: () => NpcAiCoordinator | undefined,
        actors: () => Iterable<GameCharacter>
    ) {
        this.wake = createSocialWake(room, ai)
        this.communication = new RoomCommunication(room, ai)
        this.whispers = new WhisperService({
            getCharacter: (id) => room.getCharacter(id),
            navigationFor: (actor) => room.navigationFor(actor),
            heard: createWhisperObserver(ai, () => this.questDialogues.turnIns),
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
        this.questDialogues = new RoomQuestDialogues({
            room,
            adventure,
            parties,
            quests: this.quests,
            exchanges: this.exchanges,
            whispers: this.whispers,
            actors,
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
        if (message.type === 'quest_turn_in_confirm') {
            const result = this.questDialogues.turnIns.confirm(
                actor,
                message.confirmationId,
                message.accept,
                now
            )
            this.room.publishEvents(result.events)
            if (!result.accepted) {
                this.notice(actor, result.error ?? 'Сдача недоступна.')
            }
            return true
        }
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
                (text) => this.notice(actor, text),
                (targetId, text, id) =>
                    this.questDialogues.heardPublic(
                        actor,
                        targetId,
                        text,
                        id,
                        now
                    )
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
        if (isNpcQuestClient(message)) {
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
        return isExchange(decision) || isNpcQuestDecision(decision)
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
        if (decision.type === 'quest_turn_in_request') {
            return this.questDialogues.turnIns.open(
                actor,
                decision.targetId,
                decision.instanceId,
                now
            )
        }
        if (isExchange(decision)) {
            return decideSocialExchange(this.exchanges, actor, decision, now)
        }
        if (isNpcQuestDecision(decision)) {
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
        const questView = this.quests.snapshot(actor.id, now)
        const questTurnIn = this.questDialogues.turnIns.snapshot(actor, now)
        const partnerId =
            questView.questOffer?.issuerId ??
            questTurnIn?.issuerId ??
            (exchange !== null &&
            ['active', 'invited'].includes(exchange.status)
                ? exchange.partnerId
                : undefined)
        return {
            exchange,
            privateMessages: this.whispers.heardMessages(actor.id),
            ...this.communication.snapshot(actor, now),
            whisper: this.whispers.snapshot(actor, now, partnerId),
            ...questView,
            questTurnIn,
        }
    }

    public conversation(issuerId: string, recipientId: string, now: number) {
        return this.questDialogues.conversation(issuerId, recipientId, now)
    }

    public update(now: number, actors: Iterable<GameCharacter>): void {
        this.exchanges.pause(now)
        this.quests.update(now)
        this.questDialogues.update(now)
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
        this.questDialogues.stop()
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
