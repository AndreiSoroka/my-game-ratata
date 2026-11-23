import {
    type AgentDecision,
    type ClientMessage,
    type GameEventPayload,
    npcQuestMessage,
    type NpcRequestStatus,
} from '@my-game-ratata/contracts'

import type { NpcAiCoordinator } from '../ai/coordinator'
import type { AdventureService } from './adventure'
import type { AgentDecisionResult } from './agentDecisions'
import type { GameCharacter } from './character'
import { ExchangeService } from './exchange'
import { isNpcQuestClient, isNpcQuestDecision } from './npcQuestCommands'
import { NpcQuestService } from './npcQuests'
import type { NpcQuestDecisionContext } from './npcQuestTypes'
import { npcDialogueMode } from './npcRoster'
import type { PartyService } from './parties'
import type { GameRoom } from './room'
import { RoomCommunication } from './roomCommunication'
import { RoomNpcContacts } from './roomNpcContacts'
import { RoomQuestDialogues } from './roomQuestDialogues'
import { decideSocialExchange, isExchange } from './roomSocialExchange'
import { handleSocialSpeech } from './roomSocialSpeech'
import {
    createRoomSocialSnapshot,
    projectCharacterInteractions,
} from './roomSocialViews'
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
    public readonly npcSpeech: RoomNpcContacts
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
            heard: createWhisperObserver(
                (actor, event, targetId) =>
                    this.npcSpeech.receive(actor, event, targetId),
                () => this.questDialogues.turnIns,
                (actor, listener) =>
                    adventure.cities.observeSpeech(actor.id, listener.id)
            ),
            translate: (...args) =>
                room.speechTranslations.privateSpeech(...args),
        })
        this.npcSpeech = new RoomNpcContacts(room, adventure, this.whispers, ai)
        this.exchanges = new ExchangeService({
            getCharacter: (id) => room.getCharacter(id),
            navigationFor: (actor) => room.navigationFor(actor),
            aiDialogue: (actor) =>
                this.ai()?.configured(actor.id) === true &&
                npcDialogueMode(actor.id) !== 'passive',
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
            onInvitationAccepted: (inviterId, inviteeId, now) => {
                if (this.ai()?.configured(inviterId) === true) {
                    this.wake(
                        inviterId,
                        inviteeId,
                        'Собеседник принял твоё приглашение к обмену. Проверь текущие условия и реши следующий шаг.',
                        now
                    )
                }
            },
        })
        this.quests = new NpcQuestService({
            adventure,
            parties,
            workers: room.workerRequests,
            characters: actors,
            getCharacter: (id) => room.getCharacter(id),
            navigationFor: (actor) => room.navigationFor(actor),
            canIssue: (actor) =>
                this.ai()?.configured(actor.id) === true &&
                npcDialogueMode(actor.id) !== 'passive',
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
        this.snapshot = createRoomSocialSnapshot(
            this.exchanges,
            this.quests,
            this.questDialogues.turnIns,
            this.communication,
            this.npcSpeech.turns,
            this.whispers
        )
    }

    public handle(
        actor: GameCharacter,
        message: ClientMessage,
        now: number
    ): boolean {
        if (this.npcSpeech.handle(actor, message, now)) {
            return true
        }
        if (message.type === 'quest_turn_in_confirm') {
            this.questDialogues.confirm(
                actor,
                message.confirmationId,
                message.accept,
                now
            )
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
        return this.handleQuestCommand(actor, message, now)
    }

    private handleQuestCommand(
        actor: GameCharacter,
        message: ClientMessage,
        now: number
    ): boolean {
        if (!isNpcQuestClient(message)) {
            return false
        }
        const result = this.quests.handle(actor, message, now)
        this.room.publishEvents(result.events)
        if (!result.accepted) {
            this.notice(actor, result.error ?? 'Договор недоступен.')
        } else if (message.type === 'quest_inquire') {
            this.npcSpeech.inquire(actor, result.events, now)
        }
        return true
    }

    public isDecision(decision: AgentDecision): boolean {
        return isExchange(decision) || isNpcQuestDecision(decision)
    }

    public decide(
        actor: GameCharacter,
        decision: AgentDecision,
        now: number,
        context: NpcQuestDecisionContext = {}
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
            return this.quests.handleDecision(actor, decision, now, context)
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
        return projectCharacterInteractions(
            actor,
            this.ai()?.configured(actor.id) === true
        )
    }

    public readonly snapshot: ReturnType<typeof createRoomSocialSnapshot>

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
        for (const event of events) {
            if (event.kind === 'death' || event.kind === 'permadeath') {
                this.npcSpeech.turns.close(
                    event.kind === 'death' ? event.targetId : event.actorId
                )
            }
        }
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
        const textMessage = npcQuestMessage(text)
        this.room.publishEvents([
            {
                kind: 'notice',
                actorId: actor.id,
                audienceIds: [actor.id],
                text,
                ...(textMessage === undefined ? {} : { textMessage }),
            },
        ])
    }
}
