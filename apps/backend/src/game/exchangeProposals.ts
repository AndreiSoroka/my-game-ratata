import type { ExchangeClientMessage } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ExchangeResult } from './exchange'
import type { ExchangeEnvironment, ExchangeSession } from './exchangeState'
import { updateExchangeOffer } from './exchangeTransactions'

const reject = (error: string): ExchangeResult => ({ accepted: false, error })

export function declineExchange(
    session: ExchangeSession,
    actor: GameCharacter,
    message: Extract<ExchangeClientMessage, { type: 'exchange_decline' }>
): ExchangeResult {
    if (session.status !== 'active' || session.revision !== message.revision) {
        return reject('Предложение изменилось. Проверь текущие условия.')
    }
    const index = session.actorIds[0] === actor.id ? 0 : 1
    session.offers[index].accepted = false
    session.offers[index].refusal = {
        id: JSON.stringify([
            session.id,
            index,
            session.revision,
            message.reason,
        ]),
        reason: message.reason,
    }
    session.notice = `${actor.nickname}: ${message.reason}`
    return { accepted: true, error: null }
}

export function proposeExchange(
    session: ExchangeSession,
    actor: GameCharacter,
    message: Extract<ExchangeClientMessage, { type: 'exchange_offer' }>,
    env: ExchangeEnvironment,
    now: number
): ExchangeResult {
    const index = session.actorIds[0] === actor.id ? 0 : 1
    const offer = session.offers[index]
    const requestId = message.requestId ?? ''
    const key = `${actor.id}:${requestId}`
    const fingerprint = JSON.stringify([
        message.revision,
        message.items,
        message.gold,
    ])
    const previous = session.requests.get(key)
    if (previous !== undefined) {
        return previous.fingerprint === fingerprint
            ? previous.result
            : reject('ID предложения уже использован с другими условиями.')
    }
    const result =
        session.status === 'active' && message.revision === offer.revision
            ? updateExchangeOffer(session, actor, message, env, now)
            : reject(
                  'Твоё предложение изменилось. Проверь его и отправь заново.'
              )
    session.offers[index].lastRequestId = requestId
    if (result.error !== null) {
        session.offers[index].requestError = result.error
    } else {
        delete session.offers[index].requestError
    }
    session.requests.set(key, { fingerprint, result })
    while (session.requests.size > 64) {
        const oldest = session.requests.keys().next().value
        if (oldest !== undefined) {
            session.requests.delete(oldest)
        }
    }
    return result
}
