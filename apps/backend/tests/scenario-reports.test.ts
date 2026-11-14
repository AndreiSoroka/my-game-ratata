import type { ScenarioRunSnapshot } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import type { GameRoom } from '../src/game/room'
import { ScenarioReports } from '../src/game/scenarioReports'
import {
    approachScenarioNpc,
    joinScenarioRoom,
    openScenarioRoom,
    roomScenario,
    waitForScenario,
} from './scenarioRoomHelpers'

const rooms: GameRoom[] = []
afterEach(() => {
    for (const room of rooms) {
        room.stop()
    }
    rooms.length = 0
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup() {
    const room = openScenarioRoom()
    rooms.push(room)
    const owner = joinScenarioRoom(room, 'Report owner')
    const helper = approachScenarioNpc(room, owner, 'npc_wanderer_1')
    owner.send({ type: 'interact', targetId: helper.id })
    owner.send({ type: 'dialogue_choice', choiceId: 'close' })
    const report = () =>
        owner.view().helpers.find((entry) => entry.actorId === helper.id)?.run
    return { room, owner, helper, report }
}

it('retains failed finite helper results while restoring the NPC’s default routine', () => {
    const { room, owner, helper, report } = setup()
    owner.save(
        roomScenario('failed-search', [
            { id: 'search', kind: 'search', target: 'enemy' },
        ])
    )
    owner.send({
        type: 'scenario_start',
        scenarioId: 'failed-search',
        targetId: helper.id,
    })
    waitForScenario(() => report()?.status === 'completed')
    expect(report()).toMatchObject({
        ownerId: owner.actor.id,
        actorId: helper.id,
        scenarioId: 'failed-search',
        status: 'completed',
        results: [{ status: 'failed', failures: 1 }],
    })
    expect(report()?.results[0]?.reason?.length).toBeGreaterThan(0)
    expect(
        room.snapshot(Date.now(), helper.locationId, helper.id).automation?.run
    ).toMatchObject({
        ownerId: helper.id,
        scenarioId: `idle-${helper.id}`,
        status: 'running',
    })
    expect(helper.soul.companion?.leaderId).toBeNull()
    const originalReason = report()?.results[0]?.reason
    const detached = report()
    if (detached?.results[0] !== undefined) {
        detached.results[0].reason = 'Edited client copy'
    }
    expect(report()?.results[0]?.reason).toBe(originalReason)

    const stranger = joinScenarioRoom(room, 'Report stranger')
    approachScenarioNpc(room, stranger, helper.id)
    expect(
        stranger.view().helpers.find((entry) => entry.actorId === helper.id)
            ?.run
    ).toBeNull()
    expect(
        room.snapshot(Date.now(), helper.locationId).automation
    ).toBeUndefined()
})

it('replaces an old report on accepted reassignment and never shows a new owner’s run to the old owner', () => {
    const { room, owner, helper, report } = setup()
    owner.save(
        roomScenario('first', [{ id: 'wait', kind: 'wait', durationMs: 0 }])
    )
    owner.send({
        type: 'scenario_start',
        scenarioId: 'first',
        targetId: helper.id,
    })
    waitForScenario(() => report()?.status === 'completed')
    approachScenarioNpc(room, owner, helper.id)
    owner.save(
        roomScenario('second', [
            { id: 'wait-again', kind: 'wait', durationMs: 30_000 },
        ])
    )
    owner.send({
        type: 'scenario_start',
        scenarioId: 'second',
        targetId: helper.id,
    })
    expect(report()).toMatchObject({
        scenarioId: 'second',
        status: 'running',
        results: [{ stepId: 'wait-again', status: 'pending', reason: null }],
    })
    owner.send({ type: 'scenario_stop', targetId: helper.id })
    expect(report()).toMatchObject({ scenarioId: 'second', status: 'stopped' })

    const nextOwner = joinScenarioRoom(room, 'Next report owner')
    approachScenarioNpc(room, nextOwner, helper.id)
    nextOwner.send({ type: 'interact', targetId: helper.id })
    nextOwner.send({ type: 'dialogue_choice', choiceId: 'close' })
    nextOwner.save(
        roomScenario('private-new-task', [
            { id: 'new', kind: 'wait', durationMs: 30_000 },
        ])
    )
    nextOwner.send({
        type: 'scenario_start',
        scenarioId: 'private-new-task',
        targetId: helper.id,
    })
    expect(
        nextOwner.view().helpers.find((entry) => entry.actorId === helper.id)
            ?.run
    ).toMatchObject({
        scenarioId: 'private-new-task',
        ownerId: nextOwner.actor.id,
    })
    expect(report() ?? null).toBeNull()
})

function reportFixture() {
    const owner = new GameCharacter({
        id: 'owner',
        nickname: 'Owner',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 24, y: 24 },
    })
    const actor = new GameCharacter({
        id: 'helper',
        nickname: 'Helper',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 40, y: 24 },
    })
    const report: ScenarioRunSnapshot = {
        actorId: actor.id,
        ownerId: owner.id,
        scenarioId: 'last',
        name: 'Last',
        status: 'completed',
        stepIndex: 1,
        iteration: 1,
        remainingFailureMs: 10_000,
        reason: null,
        interruption: null,
        results: [
            {
                stepId: 'failed',
                status: 'failed',
                failures: 1,
                reason: 'Not found',
            },
        ],
    }
    return {
        owner,
        actor,
        report,
        characters: new Map([
            [owner.id, owner],
            [actor.id, actor],
        ]),
    }
}

it.each([
    'owner missing',
    'actor missing',
    'owner retired',
    'actor retired',
] as const)('forgets reports when %s', (reason) => {
    const { owner, actor, report, characters } = reportFixture()
    const reports = new ScenarioReports()
    reports.record(report)
    if (reason === 'owner missing') {
        characters.delete(owner.id)
    }
    if (reason === 'actor missing') {
        characters.delete(actor.id)
    }
    if (reason === 'owner retired') {
        owner.tags.add('state.retired')
    }
    if (reason === 'actor retired') {
        actor.tags.add('state.retired')
    }
    reports.reconcile(characters)
    expect(reports.forOwner(owner.id, actor.id)).toBeUndefined()
})

it('keeps just the latest helper report and begins with no reports in a new world service', () => {
    const { owner, actor, report } = reportFixture()
    const reports = new ScenarioReports()
    reports.record(report)
    reports.record({ ...report, scenarioId: 'newest' })
    expect(reports.forOwner(owner.id, actor.id)?.scenarioId).toBe('newest')
    expect(reports.forOwner('stranger', actor.id)).toBeUndefined()
    expect(new ScenarioReports().forOwner(owner.id, actor.id)).toBeUndefined()
    reports.clear(actor.id)
    expect(reports.forOwner(owner.id, actor.id)).toBeUndefined()
})
