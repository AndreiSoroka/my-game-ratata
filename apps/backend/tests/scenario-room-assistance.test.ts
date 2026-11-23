import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    enlistScenarioCompanion,
    joinScenarioRoom,
    nearbyScenarioPoint,
    openCompanionScenarioRoom,
    openScenarioRoom,
    roomScenario,
    savedScenarioMarker,
    waitForScenario,
    walkToScenarioPoint,
} from './scenarioRoomHelpers'

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('ordinary socket scenario assistance', () => {
    it('copies a marker into an accepted task, rejects a competing owner and revokes the task after owner permadeath', async () => {
        const room = openCompanionScenarioRoom(),
            owner = joinScenarioRoom(room, 'Task Owner')
        const helper = await enlistScenarioCompanion(room, owner)
        walkToScenarioPoint(owner, nearbyScenarioPoint(room, owner.actor))
        owner.send({ type: 'marker_create', name: 'Delivery point' })
        const marker = savedScenarioMarker(owner)
        owner.actor.position = { ...helper.position }
        owner.save(
            roomScenario('delivery', [
                {
                    id: 'destination',
                    kind: 'go',
                    destination: { kind: 'marker', markerId: marker.id },
                },
                { id: 'wait', kind: 'wait', durationMs: 10_000 },
            ])
        )
        owner.send({
            type: 'scenario_start',
            scenarioId: 'delivery',
            targetId: helper.id,
        })
        expect(
            owner.view().helpers.find((entry) => entry.actorId === helper.id)
                ?.run
        ).toMatchObject({ scenarioId: 'delivery', ownerId: owner.actor.id })
        owner.send({ type: 'marker_delete', markerId: marker.id })
        owner.send({ type: 'dialogue_choice', choiceId: 'close' })
        waitForScenario(
            () =>
                owner
                    .view()
                    .helpers.find((entry) => entry.actorId === helper.id)?.run
                    ?.stepIndex === 1
        )
        expect(owner.view().markers).toEqual([])
        expect(
            Math.hypot(
                helper.position.x - marker.position.x,
                helper.position.y - marker.position.y
            )
        ).toBeLessThanOrEqual(6)

        const stranger = joinScenarioRoom(room, 'Other Owner')
        stranger.actor.position = { ...helper.position }
        stranger.send({ type: 'interact', targetId: helper.id })
        stranger.save(
            roomScenario('take-over', [
                { id: 'rest', kind: 'wait', durationMs: 5000 },
            ])
        )
        stranger.send({
            type: 'scenario_start',
            scenarioId: 'take-over',
            targetId: helper.id,
        })
        expect(
            stranger.view().helpers.find((entry) => entry.actorId === helper.id)
        ).toMatchObject({ eligible: false, run: null })
        expect(
            owner.view().helpers.find((entry) => entry.actorId === helper.id)
                ?.run?.ownerId
        ).toBe(owner.actor.id)
        stranger.send({ type: 'dialogue_choice', choiceId: 'close' })

        // Fixture damage creates a fallen body; the socket command resolves permanent retirement.
        owner.actor.applyDamage(owner.actor.hp, Date.now())
        owner.send({ type: 'abandon_life' })
        vi.advanceTimersByTime(100)
        expect(room.getCharacter(owner.actor.id)).toBeUndefined()
        expect(helper.soul.companion?.leaderId).toBeNull()
        expect(
            room.snapshot(Date.now(), helper.locationId, helper.id).automation
                ?.run
        ).toBeNull()
        const replacement = joinScenarioRoom(room, 'Task Owner')
        expect(replacement.view()).toMatchObject({
            markers: [],
            scenarios: [],
            run: null,
        })
        room.stop()
    })
})

describe('authored conditions through ordinary assignment commands', () => {
    it('keeps Prokhor and Darya on their scripted routes after an interaction', () => {
        const room = openScenarioRoom(),
            owner = joinScenarioRoom(room, 'Policy Owner')
        owner.save(
            roomScenario('simple-work', [
                { id: 'rest', kind: 'wait', durationMs: 5000 },
            ])
        )
        const prokhor = room.getCharacter('npc_wanderer_1')
        if (prokhor === undefined) {
            throw new Error('Missing Prokhor')
        }
        owner.actor.position = { ...prokhor.position }
        owner.send({
            type: 'scenario_start',
            scenarioId: 'simple-work',
            targetId: prokhor.id,
        })
        expect(prokhor.soul.companion?.leaderId).toBeNull()
        owner.send({ type: 'interact', targetId: prokhor.id })
        owner.send({
            type: 'scenario_start',
            scenarioId: 'simple-work',
            targetId: prokhor.id,
        })
        expect(prokhor.soul.companion?.leaderId).toBeNull()
        expect(
            room.snapshot(Date.now(), prokhor.locationId, prokhor.id).automation
                ?.run?.scenarioId
        ).toBe(`idle-${prokhor.id}`)

        const darya = room.getCharacter('npc_wanderer_2')
        if (darya === undefined) {
            throw new Error('Missing Darya')
        }
        owner.actor.position = { ...darya.position }
        owner.send({ type: 'interact', targetId: darya.id })
        owner.send({
            type: 'scenario_start',
            scenarioId: 'simple-work',
            targetId: darya.id,
        })
        expect(darya.soul.companion?.leaderId).toBeNull()
        expect(
            room.snapshot(Date.now(), darya.locationId, darya.id).automation
                ?.run?.scenarioId
        ).toBe(`idle-${darya.id}`)
        room.stop()
    })

    it('assigns the veteran only after modeled agreement', async () => {
        const room = openCompanionScenarioRoom(),
            owner = joinScenarioRoom(room, 'Veteran Owner')
        const veteran = room.getCharacter('npc_veteran_1')
        if (veteran === undefined) {
            throw new Error('Missing veteran')
        }
        owner.actor.position = { ...veteran.position }
        owner.save(
            roomScenario('simple-work', [
                { id: 'rest', kind: 'wait', durationMs: 5000 },
            ])
        )
        owner.send({
            type: 'scenario_start',
            scenarioId: 'simple-work',
            targetId: veteran.id,
        })
        expect(veteran.soul.companion?.leaderId).toBeNull()
        await enlistScenarioCompanion(room, owner)
        owner.send({
            type: 'scenario_start',
            scenarioId: 'simple-work',
            targetId: veteran.id,
        })
        expect(veteran.soul.companion?.leaderId).toBe(owner.actor.id)
        expect(
            owner.view().helpers.find((entry) => entry.actorId === veteran.id)
                ?.run
        ).toMatchObject({ scenarioId: 'simple-work', ownerId: owner.actor.id })
        room.stop()
    })
})
