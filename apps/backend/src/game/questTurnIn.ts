import {
    DEFAULT_QUEST_REWARD_MODE,
    type QuestRewardMode,
    type QuestTurnInPromptSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NpcQuestResult } from './npcQuests'
import { QuestBoardCatalog } from './questBoardCatalog'
import { QuestChat } from './questChat'
import { questConversationJobs } from './questConversation'
import { executeQuestTurnIn } from './questTurnInExecution'
import {
    currentQuestContact,
    type QuestContact,
    questContactAt,
    type QuestTurnInEnvironment,
    readyTurnInAction,
} from './questTurnInRules'

interface Pending extends QuestContact {
    view: QuestTurnInPromptSnapshot
}

const result = (
    accepted: boolean,
    error: string | null = null
): NpcQuestResult => ({ accepted, error, events: [] })

export class QuestTurnInService {
    private readonly pending = new Map<string, Pending>()
    private readonly completed = new Map<string, string>()
    public readonly catalog: QuestBoardCatalog
    private readonly chat: QuestChat

    public constructor(private readonly environment: QuestTurnInEnvironment) {
        this.catalog = new QuestBoardCatalog(environment)
        this.chat = new QuestChat(
            environment,
            this.catalog,
            (player, issuer, view, now) => this.store(player, issuer, view, now)
        )
    }

    public heard(
        player: GameCharacter,
        issuer: GameCharacter,
        text: string,
        now: number
    ): boolean {
        return this.chat.heard(player, issuer, text, now)
    }

    public deliveredQuestion(
        issuer: GameCharacter,
        player: GameCharacter,
        text: string,
        now: number
    ): void {
        this.chat.replies.deliveredQuestion(issuer, player, text, now)
    }

    public questionIssuer(
        player: GameCharacter,
        now: number
    ): string | undefined {
        return this.chat.replies.questionIssuer(player, now)
    }

    /** The affirmative or explicit hand-in must already have come from the player. */
    public open(
        issuer: GameCharacter,
        playerId: string,
        instanceId: string,
        now: number
    ): NpcQuestResult {
        const player = this.environment.getCharacter(playerId)
        const view = player === undefined ? null : this.snapshot(player, now)
        return view?.issuerId === issuer.id && view.instanceId === instanceId
            ? result(true)
            : result(false, 'Попросите сдачу в разговоре с заказчиком рядом.')
    }

    public snapshot(
        player: GameCharacter,
        now: number
    ): QuestTurnInPromptSnapshot | null {
        const pending = this.pending.get(player.id)
        if (pending === undefined) {
            return null
        }
        const issuer = currentQuestContact(
            this.environment,
            player,
            pending,
            now
        )
        if (
            issuer === undefined ||
            !this.stillReady(player, issuer, pending.view, now)
        ) {
            this.pending.delete(player.id)
            return null
        }
        return structuredClone(pending.view)
    }

    public confirm(
        player: GameCharacter,
        confirmationId: string,
        accept: boolean,
        now: number,
        rewardMode?: QuestRewardMode
    ): NpcQuestResult {
        const previous = this.completed.get(confirmationId)
        if (previous !== undefined) {
            return result(
                previous === player.id,
                previous === player.id ? null : 'Подтверждение вам недоступно.'
            )
        }
        const view = this.snapshot(player, now)
        if (view?.id !== confirmationId) {
            return result(
                false,
                'Окно сдачи устарело. Поговорите с заказчиком снова.'
            )
        }
        if (view.preAcceptance !== true && rewardMode !== undefined) {
            return result(false, 'Распределение награды уже закреплено.')
        }
        this.pending.delete(player.id)
        if (!accept) {
            return result(true)
        }
        const outcome = this.submit(player, view, now, rewardMode)
        if (outcome.accepted) {
            this.completed.set(confirmationId, player.id)
        }
        return outcome
    }

    private submit(
        player: GameCharacter,
        view: QuestTurnInPromptSnapshot,
        now: number,
        rewardMode?: QuestRewardMode
    ): NpcQuestResult {
        const issuer = this.environment.getCharacter(view.issuerId)
        if (issuer === undefined) {
            return result(false, 'Заказчик недоступен.')
        }
        const outcome =
            view.preAcceptance === true
                ? this.submitBoardOrder(
                      player,
                      issuer,
                      view,
                      rewardMode ?? DEFAULT_QUEST_REWARD_MODE,
                      now
                  )
                : executeQuestTurnIn(
                      this.environment,
                      player,
                      issuer,
                      view,
                      now
                  )
        if (outcome.accepted && view.action === 'report') {
            this.chat.replies.say(
                { issuer, player, now },
                'Спасибо за доклад! Теперь дождёмся проверки рабочего места и возвращения работника.',
                'Thanks for the report. Now we wait for the worker to check the site and return.'
            )
        }
        return outcome
    }

    public update(now: number): void {
        this.chat.update(now)
        for (const [playerId, pending] of this.pending) {
            const player = this.environment.getCharacter(playerId)
            if (
                player === undefined ||
                currentQuestContact(this.environment, player, pending, now) ===
                    undefined
            ) {
                this.pending.delete(playerId)
            }
        }
    }

    public stop(): void {
        this.pending.clear()
        this.chat.stop()
        this.completed.clear()
    }

    private boardOrder(
        player: GameCharacter,
        view: QuestTurnInPromptSnapshot,
        now: number
    ) {
        return this.catalog
            .available(player, now)
            .find(
                ({ entry }) =>
                    entry.id === view.instanceId &&
                    entry.revision === view.revision
            )
    }

    private submitBoardOrder(
        player: GameCharacter,
        issuer: GameCharacter,
        view: QuestTurnInPromptSnapshot,
        mode: QuestRewardMode,
        now: number
    ): NpcQuestResult {
        const board = this.boardOrder(player, view, now)
        return board === undefined
            ? result(false, 'Этот заказ уже недоступен.')
            : this.catalog.redeem(issuer, player, board, mode, now)
    }

    private stillReady(
        player: GameCharacter,
        issuer: GameCharacter,
        view: QuestTurnInPromptSnapshot,
        now: number
    ): boolean {
        if (view.preAcceptance === true) {
            const board = this.boardOrder(player, view, now)
            return (
                board !== undefined && this.catalog.directReady(player, board)
            )
        }
        const job = questConversationJobs(
            this.environment,
            issuer,
            player,
            now
        ).find((entry) => entry.instanceId === view.instanceId)
        return (
            job?.revision === view.revision &&
            readyTurnInAction(this.environment, player, job) === view.action
        )
    }

    private store(
        player: GameCharacter,
        issuer: GameCharacter,
        view: QuestTurnInPromptSnapshot,
        now: number
    ): void {
        const current = this.snapshot(player, now)
        if (
            current?.instanceId === view.instanceId &&
            current.issuerId === view.issuerId &&
            current.revision === view.revision
        ) {
            this.pending.set(player.id, {
                ...questContactAt(issuer, player, view.expiresAt),
                view: { ...view, id: current.id },
            })
            return
        }
        const exchange = this.environment.exchanges.snapshot(player.id)
        if (
            exchange !== null &&
            ['invited', 'active'].includes(exchange.status)
        ) {
            const cancelled = this.environment.exchanges.handle(
                player,
                { type: 'exchange_cancel', exchangeId: exchange.id },
                now
            )
            if (!cancelled.accepted) {
                return
            }
        }
        this.pending.set(player.id, {
            ...questContactAt(issuer, player, view.expiresAt),
            view,
        })
    }
}
