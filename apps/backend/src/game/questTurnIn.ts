import {
    npcQuestMessage,
    type QuestTurnInPromptSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NpcQuestResult } from './npcQuests'
import { conversationContracts } from './questConversation'
import { executeQuestTurnIn } from './questTurnInExecution'
import {
    createTurnInPrompt,
    type QuestTurnInEnvironment,
    readyTurnInAction,
    turnInContact,
} from './questTurnInRules'

interface Pending {
    view: QuestTurnInPromptSnapshot
    issuerDeath: number
    playerDeath: number
    sourceMessageId: string
}
interface HeardRequest {
    id: string
    at: number
    requested: boolean
}
const result = (
    accepted: boolean,
    error: string | null = null
): NpcQuestResult => ({ accepted, error, events: [] })

function requestedTurnIn(text: string): boolean {
    return (
        /^quest\s+complete[.!]*$/iu.test(text.trim()) ||
        (!/не\s+(?:готов|выполн|заверш|сда)/iu.test(text) &&
            /(?:готов|выполн|заверш|сда[тю]|сдать|отч[её]т)/iu.test(text))
    )
}

export class QuestTurnInService {
    private readonly pending = new Map<string, Pending>()
    private readonly completed = new Map<string, string>()
    private readonly latestSpeech = new Map<string, HeardRequest>()
    public constructor(private readonly environment: QuestTurnInEnvironment) {}

    public heard(
        player: GameCharacter,
        issuer: GameCharacter,
        text: string,
        messageId: string,
        now: number
    ): boolean {
        if (!turnInContact(this.environment, player, issuer, now)) {
            return false
        }
        const requested = requestedTurnIn(text)
        this.latestSpeech.set(JSON.stringify([player.id, issuer.id]), {
            id: messageId,
            at: now,
            requested,
        })
        if (!requested) {
            return false
        }
        const contracts = conversationContracts(
            this.environment,
            issuer.id,
            player.id,
            now
        ).filter(
            (job) =>
                readyTurnInAction(this.environment, player, job) !== undefined
        )
        const job = contracts.length === 1 ? contracts[0] : undefined
        return (
            job !== undefined &&
            this.open(issuer, player.id, job.instanceId, now).accepted
        )
    }

    public open(
        issuer: GameCharacter,
        playerId: string,
        instanceId: string,
        now: number
    ): NpcQuestResult {
        const available = this.availableSource(issuer, playerId, now)
        if (available === undefined) {
            return result(
                false,
                'Попросите сдачу в разговоре с заказчиком рядом.'
            )
        }
        const { player, source } = available
        const job = conversationContracts(
            this.environment,
            issuer.id,
            playerId,
            now
        ).find((entry) => entry.instanceId === instanceId)
        if (job === undefined) {
            return result(false, 'Этот договор не выдавался этому собеседнику.')
        }
        const action = readyTurnInAction(this.environment, player, job)
        if (action === undefined) {
            return result(
                false,
                job.notice ?? 'Условия ещё не выполнены или договор уже сдан.'
            )
        }
        const current = this.pending.get(playerId)
        if (
            current?.view.instanceId === instanceId &&
            current.view.expiresAt > now
        ) {
            return result(true)
        }
        const exchange = this.environment.exchanges.snapshot(playerId)
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
                return result(false, cancelled.error)
            }
        }
        const view = createTurnInPrompt(
            this.environment,
            issuer,
            playerId,
            job,
            action,
            now
        )
        this.pending.set(playerId, {
            view,
            issuerDeath: issuer.deathSequence,
            playerDeath: player.deathSequence,
            sourceMessageId: source.id,
        })
        return result(true)
    }

    private availableSource(
        issuer: GameCharacter,
        playerId: string,
        now: number
    ) {
        const player = this.environment.getCharacter(playerId)
        const source = this.latestSpeech.get(
            JSON.stringify([playerId, issuer.id])
        )
        if (
            player === undefined ||
            source?.requested !== true ||
            source.at + 30_000 <= now ||
            !turnInContact(this.environment, player, issuer, now)
        ) {
            return undefined
        }
        return { player, source }
    }

    public snapshot(
        player: GameCharacter,
        now: number
    ): QuestTurnInPromptSnapshot | null {
        const pending = this.pending.get(player.id)
        if (pending === undefined) {
            return null
        }
        const issuer = this.environment.getCharacter(pending.view.issuerId)
        if (
            issuer === undefined ||
            pending.view.expiresAt <= now ||
            pending.playerDeath !== player.deathSequence ||
            pending.issuerDeath !== issuer.deathSequence ||
            !turnInContact(this.environment, player, issuer, now)
        ) {
            return null
        }
        const job = conversationContracts(
            this.environment,
            issuer.id,
            player.id,
            now
        ).find((entry) => entry.instanceId === pending.view.instanceId)
        if (
            job?.revision !== pending.view.revision ||
            readyTurnInAction(this.environment, player, job) !==
                pending.view.action
        ) {
            return null
        }
        return structuredClone(pending.view)
    }

    public confirm(
        player: GameCharacter,
        confirmationId: string,
        accept: boolean,
        now: number
    ): NpcQuestResult {
        const previous = this.completed.get(confirmationId)
        if (previous !== undefined) {
            return result(
                previous === player.id,
                previous === player.id ? null : 'Подтверждение вам недоступно.'
            )
        }
        const pending = this.pending.get(player.id)
        const view = this.snapshot(player, now)
        if (pending?.view.id !== confirmationId || view === null) {
            return result(
                false,
                'Окно сдачи устарело. Поговорите с заказчиком снова.'
            )
        }
        this.pending.delete(player.id)
        if (!accept) {
            return result(true)
        }
        const issuer = this.environment.getCharacter(view.issuerId)
        if (issuer === undefined) {
            return result(false, 'Заказчик недоступен.')
        }
        const outcome = executeQuestTurnIn(
            this.environment,
            player,
            issuer,
            view,
            now
        )
        if (outcome.accepted) {
            this.completed.set(confirmationId, player.id)
            if (view.action === 'report') {
                const text =
                    'Спасибо за доклад! Теперь дождёмся проверки рабочего места и возвращения работника.'
                const textMessage = npcQuestMessage(text)
                this.environment.whispers.send(
                    issuer,
                    player,
                    text,
                    now,
                    textMessage === undefined ? undefined : { textMessage }
                )
            }
        }
        return outcome
    }

    public stop(): void {
        this.pending.clear()
        this.latestSpeech.clear()
        this.completed.clear()
    }
}
