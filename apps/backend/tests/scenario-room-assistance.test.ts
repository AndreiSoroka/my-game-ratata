import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    approachScenarioNpc,
    joinScenarioRoom,
    openScenarioRoom,
    roomScenario,
    savedScenarioMarker,
    waitForScenario,
} from './scenarioRoomHelpers'

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('ordinary socket scenario assistance', () => {
    it('copies a marker into an accepted task, rejects a competing owner and revokes the task after owner permadeath', () => {
        const room = openScenarioRoom(),
            owner = joinScenarioRoom(room, 'Task Owner')
        owner.send({ type: 'marker_create', name: 'Delivery point' })
        const marker = savedScenarioMarker(owner)
        const helper = approachScenarioNpc(room, owner, 'npc_wanderer_1')
        owner.send({ type: 'interact', targetId: helper.id })
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
        approachScenarioNpc(room, stranger, helper.id)
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
        ).toMatchObject({ ownerId: helper.id, scenarioId: `idle-${helper.id}` })
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
    it('requires a real meeting for Prokhor and the exact authoritative story completion fact for Darya', () => {
        const room = openScenarioRoom(),
            owner = joinScenarioRoom(room, 'Policy Owner')
        owner.save(
            roomScenario('simple-work', [
                { id: 'rest', kind: 'wait', durationMs: 5000 },
            ])
        )
        const prokhor = approachScenarioNpc(room, owner, 'npc_wanderer_1')
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
        expect(prokhor.soul.companion?.leaderId).toBe(owner.actor.id)
        owner.send({ type: 'scenario_stop', targetId: prokhor.id })
        owner.send({ type: 'dialogue_choice', choiceId: 'close' })

        const darya = approachScenarioNpc(room, owner, 'npc_wanderer_2')
        owner.send({ type: 'interact', targetId: darya.id })
        owner.send({
            type: 'scenario_start',
            scenarioId: 'simple-work',
            targetId: darya.id,
        })
        expect(darya.soul.companion?.leaderId).toBeNull()
        // Stub the authoritative quest query to isolate consent from the separate quest playthrough.
        const completed = vi
            .spyOn(room.adventureForWorkers(), 'hasCompletedQuest')
            .mockImplementation(
                (actorId, questId) =>
                    actorId === owner.actor.id &&
                    questId === 'hearts-for-the-border-bell'
            )
        owner.send({
            type: 'scenario_start',
            scenarioId: 'simple-work',
            targetId: darya.id,
        })
        expect(completed).toHaveBeenCalledWith(
            owner.actor.id,
            'hearts-for-the-border-bell'
        )
        expect(darya.soul.companion?.leaderId).toBe(owner.actor.id)
        room.stop()
    })

    it('accepts an always-willing veteran without manufacturing a meeting', () => {
        const room = openScenarioRoom(),
            owner = joinScenarioRoom(room, 'Veteran Owner')
        const veteran = approachScenarioNpc(room, owner, 'npc_veteran_1')
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
        expect(veteran.soul.companion?.leaderId).toBe(owner.actor.id)
        expect(
            owner.view().helpers.find((entry) => entry.actorId === veteran.id)
                ?.run
        ).toMatchObject({ scenarioId: 'simple-work', ownerId: owner.actor.id })
        room.stop()
    })
})
