import type {
    ExchangeClientMessage,
    ExchangeSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { declineExchange, proposeExchange } from './exchangeProposals'
import {
    closeExchange,
    emptyExchangeOffer,
    exchangeActorAvailable,
    exchangeAuthority,
    type ExchangeEnvironment,
    exchangeReachable,
    type ExchangeSession,
    pauseExchangeActor,
    viewExchangeOffer,
} from './exchangeState'
import {
    refreshExchangeOffers,
    updateExchangeOffer,
} from './exchangeTransactions'
import { availableGold, availableInventoryQuantity } from './rewardReservations'

export interface ExchangeResult {
    accepted: boolean
    error: string | null
}
const ok = (): ExchangeResult => ({ accepted: true, error: null })
const reject = (error: string): ExchangeResult => ({ accepted: false, error })

/** Both people and models submit the same voluntary, revision-bound commands. */
export class ExchangeService {
    private readonly sessions = new Map<string, ExchangeSession>()
    private readonly current = new Map<string, string>()
    private nextId = 1
    public constructor(private readonly env: ExchangeEnvironment) {}

    public handle(
        actor: GameCharacter,
        message: ExchangeClientMessage,
        now: number
    ): ExchangeResult {
        this.update(now)
        if (message.type === 'exchange_invite') {
            return this.invite(actor, message.targetId, now)
        }
        const session = this.sessions.get(message.exchangeId)
        if (!ownsSession(session, actor.id)) {
            return reject('Этот обмен тебе не принадлежит.')
        }
        if (message.type === 'exchange_cancel') {
            closeExchange(session, this.env, 'cancelled', 'Обмен закрыт.')
            return ok()
        }
        if (isCompletedRetry(session, message)) {
            return ok()
        }
        if (!exchangeAuthority(actor, this.env, now)) {
            return reject('Управление персонажем недоступно.')
        }
        if (message.type === 'exchange_answer') {
            return this.answer(session, actor, message.accept, now)
        }
        if (message.type === 'exchange_decline') {
            return declineExchange(session, actor, message)
        }
        if (
            message.type === 'exchange_offer' &&
            message.requestId !== undefined
        ) {
            return proposeExchange(session, actor, message, this.env, now)
        }
        if (
            session.status !== 'active' ||
            message.revision !== session.revision
        ) {
            return reject('Предложение изменилось. Проверь текущие условия.')
        }
        return updateExchangeOffer(session, actor, message, this.env, now)
    }

    public snapshot(actorId: string): ExchangeSnapshot | null {
        const session = this.sessions.get(this.current.get(actorId) ?? '')
        if (session === undefined) {
            return null
        }
        const ownIndex = session.actorIds[0] === actorId ? 0 : 1
        const otherIndex = ownIndex === 0 ? 1 : 0
        const own = this.env.getCharacter(actorId)
        const partner = this.env.getCharacter(session.actorIds[otherIndex])
        if (own === undefined || partner === undefined) {
            return null
        }
        return {
            id: session.id,
            revision: session.revision,
            status: session.status,
            partnerId: partner.id,
            partnerName: partner.nickname,
            incoming: ownIndex === 1,
            ownAvailability: {
                gold: availableGold(this.env.walletFor(actorId)),
                items: own.inventory.map((item) => ({
                    instanceId: item.instanceId,
                    quantity: availableInventoryQuantity(
                        own.inventory,
                        item.instanceId
                    ),
                })),
            },
            own: viewExchangeOffer(session, ownIndex, own),
            other: viewExchangeOffer(session, otherIndex, partner),
            ...(session.receiptId === undefined
                ? {}
                : { receiptId: session.receiptId }),
            ...(session.notice === undefined ? {} : { notice: session.notice }),
        }
    }

    public update(now: number): void {
        for (const session of this.sessions.values()) {
            if (session.status !== 'invited' && session.status !== 'active') {
                continue
            }
            const a = this.env.getCharacter(session.actorIds[0])
            const b = this.env.getCharacter(session.actorIds[1])
            if (
                !exchangeActorAvailable(a, this.env) ||
                !exchangeActorAvailable(b, this.env) ||
                !exchangeReachable(a, b, this.env, now) ||
                now >= session.expiresAt
            ) {
                closeExchange(
                    session,
                    this.env,
                    'cancelled',
                    'Собеседник больше недоступен.'
                )
                continue
            }
            if (
                session.status === 'active' &&
                (!exchangeAuthority(a, this.env, now) ||
                    !exchangeAuthority(b, this.env, now))
            ) {
                closeExchange(
                    session,
                    this.env,
                    'cancelled',
                    'Управление участником обмена изменилось.'
                )
                continue
            }
            refreshExchangeOffers(session, [a, b], this.env)
        }
        this.prune()
    }

    /** Call before simulation; controllers also consult isPaused before intentions. */
    public pause(now: number): void {
        this.update(now)
        for (const session of this.sessions.values()) {
            for (const id of session.paused.keys()) {
                const actor = this.env.getCharacter(id)
                if (actor !== undefined) {
                    pauseExchangeActor(session, actor, now)
                }
            }
        }
    }

    public isPaused(actorId: string): boolean {
        const session = this.sessions.get(this.current.get(actorId) ?? '')
        return session?.paused.has(actorId) ?? false
    }

    public stop(): void {
        for (const session of this.sessions.values()) {
            closeExchange(session, this.env, 'cancelled', 'Мир остановлен.')
        }
    }

    private invite(
        actor: GameCharacter,
        targetId: string,
        now: number
    ): ExchangeResult {
        const target = this.env.getCharacter(targetId)
        if (
            !exchangeActorAvailable(actor, this.env) ||
            !exchangeActorAvailable(target, this.env) ||
            !exchangeAuthority(actor, this.env, now) ||
            !exchangeReachable(actor, target, this.env, now)
        ) {
            return reject('Для обмена подойди к доступному собеседнику.')
        }
        if ([actor.id, target.id].some((id) => this.isBusy(id))) {
            return reject('Один из участников уже занят обменом.')
        }
        const session: ExchangeSession = {
            requests: new Map(),
            id: `exchange-${String(this.nextId++)}`,
            revision: 1,
            status: 'invited',
            actorIds: [actor.id, target.id],
            offers: [emptyExchangeOffer(), emptyExchangeOffer()],
            paused: new Map(),
            expiresAt: now + 120_000,
        }
        this.sessions.set(session.id, session)
        for (const id of session.actorIds) {
            this.current.set(id, session.id)
        }
        pauseExchangeActor(session, actor, now)
        this.env.onInvite?.(actor.id, target.id, session.id, now)
        return ok()
    }

    private answer(
        session: ExchangeSession,
        actor: GameCharacter,
        accept: boolean,
        now: number
    ): ExchangeResult {
        if (
            session.actorIds[1] === actor.id &&
            session.status === 'active' &&
            accept
        ) {
            return ok()
        }
        if (session.status !== 'invited' || session.actorIds[1] !== actor.id) {
            return reject('Приглашение больше недоступно.')
        }
        if (!accept) {
            closeExchange(
                session,
                this.env,
                'cancelled',
                'Приглашение отклонено.'
            )
            return ok()
        }
        session.status = 'active'
        session.expiresAt = now + 600_000
        pauseExchangeActor(session, actor, now)
        this.env.onInvitationAccepted?.(session.actorIds[0], actor.id, now)
        return ok()
    }

    private isBusy(actorId: string): boolean {
        const session = this.sessions.get(this.current.get(actorId) ?? '')
        return session?.status === 'active' || session?.status === 'invited'
    }
    private prune(): void {
        if (this.sessions.size <= 128) {
            return
        }
        for (const [id, session] of this.sessions) {
            if (
                session.status === 'completed' ||
                session.status === 'cancelled'
            ) {
                this.sessions.delete(id)
                for (const actorId of session.actorIds) {
                    if (this.current.get(actorId) === id) {
                        this.current.delete(actorId)
                    }
                }
                break
            }
        }
    }
}

function ownsSession(
    session: ExchangeSession | undefined,
    actorId: string
): session is ExchangeSession {
    return session?.actorIds.includes(actorId) === true
}
function isCompletedRetry(
    session: ExchangeSession,
    message: ExchangeClientMessage
): boolean {
    return (
        session.status === 'completed' &&
        message.type === 'exchange_accept' &&
        message.revision === session.revision
    )
}
