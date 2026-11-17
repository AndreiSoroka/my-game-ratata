import { afterEach, expect, it, vi } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import type { GameRoom } from '../src/game/room'
import {
    joinScenarioRoom,
    nearbyScenarioPoint,
    openScenarioRoom,
    walkToScenarioPoint,
} from './scenarioRoomHelpers'

let room: GameRoom | undefined
afterEach(() => {
    room?.stop()
    room = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('validates exchange socket commands, keeps offers private, and commits a shared receipt', () => {
    room = openScenarioRoom()
    const alice = joinScenarioRoom(room, 'Exchange Alice')
    const bob = joinScenarioRoom(room, 'Exchange Bob')
    const bystander = joinScenarioRoom(room, 'Exchange Bystander')
    walkToScenarioPoint(bob, alice.actor.position)
    const sword = createItemInstance('simple_sword')
    alice.actor.inventory.push(sword)
    room.adventureForWorkers().walletFor(bob.actor.id).gold = 5
    alice.send({ type: 'exchange_invite', targetId: bob.actor.id })
    const invite = room.social.exchanges.snapshot(bob.actor.id)
    const exchangeId = invite?.id ?? ''
    expect(invite?.incoming).toBe(true)
    expect(
        room.snapshot(
            Date.now(),
            bystander.actor.locationId,
            bystander.actor.id
        ).social?.exchange
    ).toBeNull()
    bob.send({ type: 'exchange_answer', exchangeId, accept: true })
    alice.send({
        type: 'exchange_offer',
        exchangeId,
        revision: room.social.exchanges.snapshot(alice.actor.id)?.revision ?? 0,
        gold: 0,
        items: [{ instanceId: sword.instanceId, quantity: 1 }],
    })
    bob.send({
        type: 'exchange_offer',
        exchangeId,
        revision: room.social.exchanges.snapshot(bob.actor.id)?.revision ?? 0,
        gold: 5,
        items: [],
    })
    const revision =
        room.social.exchanges.snapshot(alice.actor.id)?.revision ?? 0
    bystander.send({ type: 'exchange_accept', exchangeId, revision })
    expect(room.social.exchanges.snapshot(alice.actor.id)?.own.accepted).toBe(
        false
    )
    alice.send({ type: 'exchange_accept', exchangeId, revision })
    bob.send({ type: 'exchange_accept', exchangeId, revision })
    expect(room.social.exchanges.snapshot(alice.actor.id)?.status).toBe(
        'completed'
    )
    expect(
        bob.actor.inventory.some((item) => item.instanceId === sword.instanceId)
    ).toBe(true)
    expect(room.adventureForWorkers().walletFor(alice.actor.id).gold).toBe(5)
    const receipt = room.social.exchanges.snapshot(bob.actor.id)?.receiptId
    alice.send({ type: 'exchange_accept', exchangeId, revision })
    expect(room.social.exchanges.snapshot(bob.actor.id)?.receiptId).toBe(
        receipt
    )
    expect(room.adventureForWorkers().walletFor(alice.actor.id).gold).toBe(5)
})

it('pauses a stationary route beyond its failure timeout and revalidates it on exchange close', () => {
    room = openScenarioRoom()
    const alice = joinScenarioRoom(room, 'Pausing Alice')
    const bob = joinScenarioRoom(room, 'Pausing Bob')
    walkToScenarioPoint(bob, alice.actor.position)
    const destination = nearbyScenarioPoint(room, alice.actor)
    alice.send({ type: 'move_to', target: destination })
    const position = { ...alice.actor.position }
    alice.send({ type: 'exchange_invite', targetId: bob.actor.id })
    const exchangeId = room.social.exchanges.snapshot(alice.actor.id)?.id ?? ''
    expect(room.social.exchanges.isPaused(alice.actor.id)).toBe(true)
    expect(room.social.exchanges.isPaused(bob.actor.id)).toBe(false)
    alice.send({ type: 'move_input', axis: { x: 1, y: 0 } })
    vi.advanceTimersByTime(15_000)
    expect(alice.actor.position).toEqual(position)
    alice.send({ type: 'exchange_cancel', exchangeId })
    expect(room.social.exchanges.isPaused(alice.actor.id)).toBe(false)
    expect(alice.actor.hasPath()).toBe(true)
    vi.advanceTimersByTime(500)
    expect(alice.actor.position).not.toEqual(position)
})
