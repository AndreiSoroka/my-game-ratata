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
    const history = room.social.society.history
    const location = alice.actor.locationId
    const received = history.knownIncidents(bob.actor.id, location)
    expect(received).toMatchObject([
        { kind: 'honest_exchange', actorId: alice.actor.id, firsthand: true },
    ])
    expect(history.knownIncidents(alice.actor.id, location)).toMatchObject([
        { kind: 'honest_exchange', actorId: bob.actor.id, firsthand: true },
    ])
    expect(history.knownIncidents(bystander.actor.id, location)).toEqual([])
    const reputation = history.knownReputation(
        bob.actor.id,
        location,
        alice.actor.id
    )
    expect(reputation).toEqual({ honesty: 6, usefulness: 2, danger: 0 })
    alice.send({ type: 'exchange_accept', exchangeId, revision })
    expect(room.social.exchanges.snapshot(bob.actor.id)?.receiptId).toBe(
        receipt
    )
    expect(room.adventureForWorkers().walletFor(alice.actor.id).gold).toBe(5)
    expect(history.knownIncidents(bob.actor.id, location)).toEqual(received)
    expect(
        history.knownReputation(bob.actor.id, location, alice.actor.id)
    ).toEqual(reputation)
})

it('credits the giver of a settled gift once and ignores a rapid round trip of the same item', () => {
    const game = openScenarioRoom()
    room = game
    const alice = joinScenarioRoom(game, 'First giver')
    const bob = joinScenarioRoom(game, 'Second giver')
    walkToScenarioPoint(bob, alice.actor.position)
    const sword = createItemInstance('simple_sword')
    alice.actor.inventory.push(sword)
    const history = game.social.society.history
    const location = alice.actor.locationId

    const gift = (giver: typeof alice, receiver: typeof bob) => {
        giver.send({ type: 'exchange_invite', targetId: receiver.actor.id })
        const exchange = () => game.social.exchanges.snapshot(giver.actor.id)
        const exchangeId = exchange()?.id ?? ''
        receiver.send({ type: 'exchange_answer', exchangeId, accept: true })
        giver.send({
            type: 'exchange_offer',
            exchangeId,
            revision: exchange()?.revision ?? 0,
            gold: 0,
            items: [{ instanceId: sword.instanceId, quantity: 1 }],
        })
        const revision = exchange()?.revision ?? 0
        giver.send({ type: 'exchange_accept', exchangeId, revision })
        receiver.send({ type: 'exchange_accept', exchangeId, revision })
        expect(exchange()?.status).toBe('completed')
        return exchange()?.receiptId
    }

    const receipt = gift(alice, bob)
    expect(history.knownIncidents(bob.actor.id, location)).toMatchObject([
        { kind: 'help', actorId: alice.actor.id, targetId: bob.actor.id },
    ])
    expect(history.knownIncidents(alice.actor.id, location)).toEqual([])
    expect(
        history.knownReputation(bob.actor.id, location, alice.actor.id)
    ).toEqual({ honesty: 1, usefulness: 6, danger: 0 })
    expect(gift(bob, alice)).not.toBe(receipt)
    expect(alice.actor.inventory).toContainEqual(sword)
    expect(history.knownIncidents(alice.actor.id, location)).toEqual([])
    expect(history.knownIncidents(bob.actor.id, location)).toHaveLength(1)

    vi.setSystemTime(Date.now() + 5 * 60_000)
    gift(alice, bob)
    expect(history.knownIncidents(bob.actor.id, location)).toHaveLength(2)
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
    // This test observes authoritative movement, so avoid serializing 600 unused snapshots
    // while advancing the logical timeout. Reliable exchange events still get delivered.
    Object.assign(alice.socket, { getBufferedAmount: () => 1 })
    Object.assign(bob.socket, { getBufferedAmount: () => 1 })
    alice.send({ type: 'move_input', axis: { x: 1, y: 0 } })
    vi.advanceTimersByTime(15_000)
    expect(alice.actor.position).toEqual(position)
    alice.send({ type: 'exchange_cancel', exchangeId })
    expect(room.social.exchanges.isPaused(alice.actor.id)).toBe(false)
    expect(alice.actor.hasPath()).toBe(true)
    vi.advanceTimersByTime(500)
    expect(alice.actor.position).not.toEqual(position)
})
