import { expect, it, vi } from 'vitest'

import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { WorkerSimulation } from './workerRequestFixture'

it('keeps concurrent worker claims, trophy reports and completion separate for one group', () => {
    const test = new WorkerSimulation('farmer')
    const second = test.addFarmer('second-farmer')
    const groupKey = 'solo:hero'
    const members = new Set([test.player.id])
    const report = (id: string) =>
        test.requests.report(id, groupKey, test.player, test.room, test.now)
    const active = (id: string) => test.requests.active(groupKey, id)

    test.tick()
    expect(test.requests.forWorker(second.id)?.stage).toBe('reporting')
    test.enemy.alive = false
    test.until(() => test.requests.list().length === 2)
    const firstId = test.current().id
    const secondId = test.requests.forWorker(second.id)?.id
    if (secondId === undefined) {
        throw new Error('The second farmer did not publish a request')
    }
    for (const id of [firstId, secondId]) {
        expect(
            test.requests.accept(
                id,
                groupKey,
                members,
                test.characters,
                test.now
            )
        ).toBeNull()
    }
    expect(test.requests.list()).toHaveLength(0)

    test.player.inventory.push(createItemInstance('bone'))
    expect(report(firstId)).toBeNull()
    expect(report(secondId)).toContain('трофей')
    expect(countInventoryItem(test.player.inventory, 'bone')).toBe(0)
    expect(active(firstId)).toMatchObject({
        stage: 'outbound',
        proofAccepted: true,
    })
    expect(active(secondId)).toMatchObject({
        stage: 'waiting',
        proofAccepted: false,
    })

    test.until(() => active(firstId)?.stage === 'ready')
    const payFirst = vi.fn(() => true)
    expect(test.requests.completeWith(firstId, groupKey, payFirst)).toBe(true)
    expect(test.requests.completeWith(firstId, groupKey, payFirst)).toBe(false)
    expect(payFirst).toHaveBeenCalledTimes(1)
    expect(active(secondId)?.stage).toBe('waiting')

    test.player.inventory.push(createItemInstance('bone'))
    expect(report(secondId)).toBeNull()
    expect(countInventoryItem(test.player.inventory, 'bone')).toBe(0)
    test.until(() => active(secondId)?.stage === 'ready')
    const paySecond = vi.fn(() => true)
    expect(test.requests.completeWith(secondId, groupKey, paySecond)).toBe(true)
    expect(paySecond).toHaveBeenCalledTimes(1)
    expect(test.requests.snapshot(firstId)?.stage).toBe('completed')
    expect(test.requests.snapshot(secondId)?.stage).toBe('completed')
})
