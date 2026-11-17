import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import { workerActivity } from '../src/game/workerActivity'
import {
    pauseWorkerActivity,
    recordWorkerActivity,
} from '../src/game/workerActivityState'
import { WorkerFarm } from '../src/game/workerFarm'
import { bareFarmerWorld } from './workerActivityFixture'
import { WorkerSimulation } from './workerRequestFixture'

it('records the selected real plot and seed supply intention at the farmer decision', () => {
    const f = bareFarmerWorld()
    new WorkerFarm().update(f.worker, f.room, 0)
    const status = workerActivity(f.worker, f.adventure, f.requests, 0)
    expect(status).toMatchObject({
        reason: 'working',
        intent: 'get_seed',
        worksite: { kind: 'farm', locationId: f.worker.locationId },
        since: 0,
        observedAt: 0,
    })
    expect(status?.worksite?.sourceId).toMatch(/^farm_/)
    expect(f.adventure.farmSupply.workSchedule(f.worker.id).remaining).toBe(6)
})

it('reports a missing supplier rather than saying the harvest quota was completed', () => {
    const f = bareFarmerWorld()
    const merchant = f.characters.get('npc_merchant_1')
    if (merchant === undefined) {
        throw new Error('Missing fixture merchant')
    }
    merchant.alive = false
    new WorkerFarm().update(f.worker, f.room, 0)
    const status = workerActivity(f.worker, f.adventure, f.requests, 10)
    expect(status).toMatchObject({ reason: 'supplier', intent: 'wait' })
    expect(f.adventure.farmSupply.workStatus(f.worker, 10)?.reason).toBe(
        'supplier'
    )
    expect(status?.text).not.toContain('норма')
    expect(f.commands).toHaveLength(0)
})

it('retries a real failed path after one second without spending the remaining work quota', () => {
    const f = bareFarmerWorld()
    f.worker.position = { x: 80, y: 80 }
    f.worker.inventory.push(createItemInstance('wheat_seed'))
    const find = vi
        .spyOn(f.room.navigationFor(f.worker), 'findPathWorld')
        .mockReturnValue([])
    const farm = new WorkerFarm()
    farm.update(f.worker, f.room, 0)
    farm.update(f.worker, f.room, 500)
    expect(
        workerActivity(f.worker, f.adventure, f.requests, 500)
    ).toMatchObject({ reason: 'route', intent: 'wait', until: 1000 })
    expect(f.commands).toHaveLength(0)
    expect(f.adventure.farmSupply.remaining(f.worker.id)).toBe(6)
    find.mockRestore()
    farm.update(f.worker, f.room, 1000)
    expect(f.worker.hasPath()).toBe(true)
    expect(
        workerActivity(f.worker, f.adventure, f.requests, 1000)?.reason
    ).toBe('working')
})

it('records full-bag refusal and a stable action receipt without granting the harvest', () => {
    const f = new WorkerSimulation('farmer')
    f.enemy.alive = false
    f.worker.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
        createItemInstance('boots')
    )
    new WorkerFarm().update(f.worker, f.room, 0)
    const first = workerActivity(f.worker, f.adventure, f.requests, 0)
    const repeated = workerActivity(f.worker, f.adventure, f.requests, 20)
    expect(first).toMatchObject({
        reason: 'bag',
        lastResult: { command: 'farm_action', accepted: false, at: 0 },
    })
    expect(first?.lastResult?.receiptId).toBe(repeated?.lastResult?.receiptId)
    expect(f.worker.inventory.every((item) => item.itemId === 'boots')).toBe(
        true
    )
    expect(
        f.adventure
            .farmSnapshot(f.worksite.locationId, 20)
            .find((plot) => plot.id === f.worksite.sourceId)?.phase
    ).toBe('ripe')
})

it('distinguishes an actually lost seed advance from a completed quota', () => {
    const f = bareFarmerWorld()
    expect(f.adventure.farmSupply.beginWork(f.worker, 0)).toBe(true)
    const merchant = f.characters.get('npc_merchant_1')
    if (merchant === undefined) {
        throw new Error('Missing fixture merchant')
    }
    f.worker.locationId = merchant.locationId
    f.worker.position = { ...merchant.position }
    const supply = f.adventure.handleResult(
        f.worker,
        {
            type: 'farm_supply',
            npcId: merchant.id,
            plotId: f.worksite.sourceId ?? '',
            requestId: 'advance',
        },
        [...f.characters.values()],
        f.room.navigationFor(f.worker),
        0
    )
    expect(supply.accepted).toBe(true)
    f.worker.inventory = []
    f.adventure.farmSupply.reconcile(f.worker)
    expect(f.adventure.farmSupply.workStatus(f.worker, 1000)).toMatchObject({
        reason: 'seeds',
        until: 600_000,
    })
})

it('projects an actual controller pause without losing its selected worksite', () => {
    const f = bareFarmerWorld()
    recordWorkerActivity(
        f.worker,
        {
            reason: 'working',
            intent: 'sow',
            text: 'Сею.',
            worksite: f.worksite,
        },
        100
    )
    pauseWorkerActivity(f.worker, 'conversation', 200)
    expect(
        workerActivity(f.worker, f.adventure, f.requests, 200)
    ).toMatchObject({
        reason: 'conversation',
        intent: 'wait',
        worksite: f.worksite,
        since: 200,
    })
    pauseWorkerActivity(f.worker, 'conversation', 300)
    expect(workerActivity(f.worker, f.adventure, f.requests, 300)?.since).toBe(
        200
    )
})
