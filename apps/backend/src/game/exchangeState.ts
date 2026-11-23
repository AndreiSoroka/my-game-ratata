import type {
    ExchangeItemQuantity,
    ExchangeOfferSnapshot,
    ExchangeSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { deferCharacterRoute } from './characterRoute'
import { snapshotItem } from './inventoryItems'
import { distance } from './math'
import { cancelMovementMode } from './movementActions'
import type { NavigationService } from './navigation'
import { visibilityRadius } from './queries'
import {
    type AssetWallet,
    availableGold,
    availableInventoryQuantity,
} from './rewardReservations'

export interface ExchangeEnvironment {
    getCharacter(id: string): GameCharacter | undefined
    navigationFor(actor: GameCharacter): NavigationService
    aiDialogue(actor: GameCharacter): boolean
    canControlAI(actor: GameCharacter, now: number): boolean
    walletFor(id: string): AssetWallet
    onInvite?(
        actorId: string,
        partnerId: string,
        exchangeId: string,
        now: number
    ): void
    onInvitationAccepted?(
        inviterId: string,
        inviteeId: string,
        now: number
    ): void
    onSettled?(settlement: ExchangeSettlement): void
}

interface ExchangeSettlementParticipant {
    readonly actor: GameCharacter
    readonly contributed: boolean
}

export interface ExchangeSettlement {
    readonly receiptId: string
    readonly participants: readonly [
        ExchangeSettlementParticipant,
        ExchangeSettlementParticipant,
    ]
    readonly at: number
}
export interface ExchangeOffer {
    refusal?: { id: string; reason: string }
    revision: number
    lastRequestId?: string
    requestError?: string
    items: ExchangeItemQuantity[]
    gold: number
    accepted: boolean
    fingerprint: string
}
export interface PausedExchangeIntent {
    locationId: string
    deathSequence: number
    path: Vector2[]
}
export interface ExchangeSession {
    requests: Map<
        string,
        { fingerprint: string; result: import('./exchange').ExchangeResult }
    >
    id: string
    revision: number
    status: ExchangeSnapshot['status']
    actorIds: [string, string]
    offers: [ExchangeOffer, ExchangeOffer]
    paused: Map<string, PausedExchangeIntent>
    expiresAt: number
    receiptId?: string
    settledOffers?: [ExchangeOfferSnapshot, ExchangeOfferSnapshot]
    notice?: string
}

export function emptyExchangeOffer(): ExchangeOffer {
    return {
        revision: 1,
        items: [],
        gold: 0,
        accepted: false,
        fingerprint: '[]',
    }
}

export function exchangeActorAvailable(
    actor: GameCharacter | undefined,
    env: ExchangeEnvironment
): actor is GameCharacter {
    return (
        actor !== undefined &&
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        actor.soul.canSpeak &&
        (actor.controllerKind === 'network_player'
            ? actor.connected
            : env.aiDialogue(actor))
    )
}

export function exchangeReachable(
    a: GameCharacter,
    b: GameCharacter,
    env: ExchangeEnvironment,
    now: number
): boolean {
    return (
        a.id !== b.id &&
        a.locationId === b.locationId &&
        distance(a.position, b.position) <= visibilityRadius(a, b, 48, now) &&
        distance(a.position, b.position) <= visibilityRadius(b, a, 48, now) &&
        env.navigationFor(a).hasLineOfSight(a.position, b.position)
    )
}

export function exchangeAuthority(
    actor: GameCharacter,
    env: ExchangeEnvironment,
    now: number
): boolean {
    return actor.controllerKind === 'network_player'
        ? actor.connected
        : env.canControlAI(actor, now)
}

export function offerFingerprint(
    actor: GameCharacter,
    items: readonly ExchangeItemQuantity[]
): string {
    return JSON.stringify(
        items.map((selected) => ({
            selected,
            item: actor.inventory.find(
                (item) => item.instanceId === selected.instanceId
            ),
            available: availableInventoryQuantity(
                actor.inventory,
                selected.instanceId
            ),
        }))
    )
}

export function validExchangeOffer(
    actor: GameCharacter,
    env: ExchangeEnvironment,
    items: readonly ExchangeItemQuantity[],
    gold: number
): boolean {
    return (
        Number.isSafeInteger(gold) &&
        gold >= 0 &&
        availableGold(env.walletFor(actor.id)) >= gold &&
        items.length <= 100 &&
        new Set(items.map((item) => item.instanceId)).size === items.length &&
        items.every(
            (item) =>
                Number.isSafeInteger(item.quantity) &&
                item.quantity > 0 &&
                availableInventoryQuantity(actor.inventory, item.instanceId) >=
                    item.quantity
        )
    )
}

export function snapshotExchangeOffer(
    offer: ExchangeOffer,
    actor: GameCharacter
) {
    return {
        revision: offer.revision,
        ...(offer.refusal === undefined
            ? {}
            : { refusal: { ...offer.refusal } }),
        ...(offer.lastRequestId === undefined
            ? {}
            : { lastRequestId: offer.lastRequestId }),
        ...(offer.requestError === undefined
            ? {}
            : { requestError: offer.requestError }),
        gold: offer.gold,
        accepted: offer.accepted,
        items: offer.items.flatMap((selected) => {
            const item = actor.inventory.find(
                (entry) => entry.instanceId === selected.instanceId
            )
            return item === undefined
                ? []
                : [{ ...snapshotItem(item), quantity: selected.quantity }]
        }),
    }
}

export function viewExchangeOffer(
    session: ExchangeSession,
    index: 0 | 1,
    actor: GameCharacter
) {
    return structuredClone(
        session.settledOffers?.[index] ??
            snapshotExchangeOffer(session.offers[index], actor)
    )
}

export function pauseExchangeActor(
    session: ExchangeSession,
    actor: GameCharacter,
    now: number
): void {
    if (!session.paused.has(actor.id)) {
        session.paused.set(actor.id, {
            locationId: actor.locationId,
            deathSequence: actor.deathSequence,
            path: actor.remainingPath().map((point) => ({ ...point })),
        })
    }
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    deferCharacterRoute(actor, now)
    actor.clearPendingAttackHit()
    cancelMovementMode(actor)
}

export function resumeExchangeActors(
    session: ExchangeSession,
    env: ExchangeEnvironment
): void {
    for (const [id, intent] of session.paused) {
        const actor = env.getCharacter(id)
        if (
            actor?.alive === true &&
            actor.locationId === intent.locationId &&
            actor.deathSequence === intent.deathSequence &&
            !actor.hasPath() &&
            (actor.controllerKind !== 'network_player' || actor.connected)
        ) {
            const destination = intent.path.at(-1)
            if (destination !== undefined) {
                actor.setPath(
                    env
                        .navigationFor(actor)
                        .findPathWorld(actor.position, destination)
                )
            }
        }
    }
    session.paused.clear()
}

export function reviseExchange(session: ExchangeSession): void {
    session.revision += 1
    session.offers.forEach((offer) => {
        offer.accepted = false
        delete offer.refusal
    })
}

export function closeExchange(
    session: ExchangeSession,
    env: ExchangeEnvironment,
    status: 'completed' | 'cancelled',
    notice: string
): void {
    if (session.status === 'completed' || session.status === 'cancelled') {
        return
    }
    session.status = status
    session.notice = notice
    resumeExchangeActors(session, env)
}
