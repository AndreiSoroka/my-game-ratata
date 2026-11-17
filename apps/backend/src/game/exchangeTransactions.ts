import type { ExchangeClientMessage } from '@my-game-ratata/contracts'

import { planAssetSettlement } from './assetSettlement'
import type { GameCharacter } from './character'
import type { ExchangeResult } from './exchange'
import {
    closeExchange,
    type ExchangeEnvironment,
    exchangeReachable,
    type ExchangeSession,
    offerFingerprint,
    reviseExchange,
    snapshotExchangeOffer,
    validExchangeOffer,
} from './exchangeState'

type OfferCommand = Extract<
    ExchangeClientMessage,
    { type: 'exchange_offer' | 'exchange_accept' }
>

export function updateExchangeOffer(
    session: ExchangeSession,
    actor: GameCharacter,
    message: OfferCommand,
    env: ExchangeEnvironment,
    now: number
): ExchangeResult {
    const index = session.actorIds[0] === actor.id ? 0 : 1
    if (message.type === 'exchange_offer') {
        if (!validExchangeOffer(actor, env, message.items, message.gold)) {
            return {
                accepted: false,
                error: 'Вещи или свободное золото больше недоступны.',
            }
        }
        const previous = session.offers[index]
        const normalized = (items: typeof message.items) =>
            JSON.stringify(
                [...items].sort((a, b) =>
                    a.instanceId.localeCompare(b.instanceId)
                )
            )
        if (
            previous.gold === message.gold &&
            normalized(previous.items) === normalized(message.items)
        ) {
            return { accepted: true, error: null }
        }
        session.offers[index] = {
            revision: previous.revision + 1,
            items: structuredClone(message.items),
            gold: message.gold,
            accepted: false,
            fingerprint: offerFingerprint(actor, message.items),
        }
        reviseExchange(session)
        delete session.notice
        session.expiresAt = now + 600_000
        return { accepted: true, error: null }
    }
    session.offers[index].accepted = true
    delete session.offers[index].refusal
    return session.offers.every((entry) => entry.accepted)
        ? settleExchange(session, env, now)
        : { accepted: true, error: null }
}

function settleExchange(
    session: ExchangeSession,
    env: ExchangeEnvironment,
    now: number
): ExchangeResult {
    const a = env.getCharacter(session.actorIds[0])
    const b = env.getCharacter(session.actorIds[1])
    if (
        a === undefined ||
        b === undefined ||
        !exchangeReachable(a, b, env, now)
    ) {
        return { accepted: false, error: 'Собеседник больше недоступен.' }
    }
    const [left, right] = session.offers
    if (
        left.items.length + right.items.length === 0 &&
        left.gold + right.gold === 0
    ) {
        reviseExchange(session)
        return { accepted: false, error: 'Добавь в обмен вещь или золото.' }
    }
    const plan = planAssetSettlement({
        items: [
            { from: a.inventory, to: b.inventory, items: left.items },
            { from: b.inventory, to: a.inventory, items: right.items },
        ],
        gold: [
            {
                from: env.walletFor(a.id),
                to: env.walletFor(b.id),
                amount: left.gold,
            },
            {
                from: env.walletFor(b.id),
                to: env.walletFor(a.id),
                amount: right.gold,
            },
        ],
    })
    const settledOffers = [
        snapshotExchangeOffer(left, a),
        snapshotExchangeOffer(right, b),
    ] as const
    if (plan?.commit() !== true) {
        reviseExchange(session)
        return {
            accepted: false,
            error: 'Обмен не помещается в сумки или ресурсы изменились.',
        }
    }
    session.settledOffers = [settledOffers[0], settledOffers[1]]
    session.receiptId = `${session.id}:${String(session.revision)}`
    closeExchange(session, env, 'completed', 'Обмен завершён.')
    return { accepted: true, error: null }
}

export function refreshExchangeOffers(
    session: ExchangeSession,
    actors: [GameCharacter, GameCharacter],
    env: ExchangeEnvironment
): void {
    let changed = false
    for (const index of [0, 1] as const) {
        const actor = actors[index]
        const offer = session.offers[index]
        const fingerprint = offerFingerprint(actor, offer.items)
        if (
            fingerprint !== offer.fingerprint ||
            !validExchangeOffer(actor, env, offer.items, offer.gold)
        ) {
            offer.items = offer.items.filter((item) =>
                validExchangeOffer(actor, env, [item], 0)
            )
            if (!validExchangeOffer(actor, env, [], offer.gold)) {
                offer.gold = 0
            }
            offer.fingerprint = offerFingerprint(actor, offer.items)
            offer.revision += 1
            changed = true
        }
    }
    if (changed) {
        reviseExchange(session)
        session.notice =
            'Состав или доступность предложения изменились. Подтверди заново.'
    }
}
