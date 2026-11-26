import {
    type AdventureClientMessage,
    CENTER_LOCATION_ID,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { WORKER_REQUEST_ORPHAN_MS } from '../src/game/workerRequestData'
import { WorkerSimulation } from './workerRequestFixture'

describe('shared worker incidents', () => {
    it('walks to the clerk before publication and remains blocked after the threat disappears', () => {
        const test = new WorkerSimulation('lumberjack')
        test.tick()
        expect(test.requests.list()).toEqual([])
        expect(test.current().stage).toBe('reporting')
        test.enemy.alive = false
        test.until(() => test.requests.list().length === 1)
        expect(test.worker.locationId).toBe(CENTER_LOCATION_ID)
        expect(test.movedPixels).toBeGreaterThan(300)
        expect(test.commands).toHaveLength(0)
        const id = test.current().id
        for (let tick = 0; tick < 100; tick += 1) {
            test.tick()
        }
        expect(test.requests.list()).toHaveLength(1)
        expect(test.current()).toMatchObject({ id, stage: 'waiting' })
        expect(test.commands).toHaveLength(0)
        const before = test.stock('wood')
        test.adventure.economy.update(test.now + 300_000)
        expect(test.stock('wood')).toBeLessThan(before)
    })

    it('atomically takes the specified old trophy only once across failed trials and abandonment', () => {
        const test = new WorkerSimulation('lumberjack')
        test.publish()
        test.accept()
        expect(test.report()).toContain('трофей')
        test.player.inventory.push(createItemInstance('slime_heart'))
        expect(test.report()).toContain('трофей')
        expect(countInventoryItem(test.player.inventory, 'slime_heart')).toBe(1)
        test.player.inventory.push(createItemInstance('bone'))
        expect(test.report()).toBeNull()
        expect(countInventoryItem(test.player.inventory, 'bone')).toBe(0)
        test.enemy.alive = true
        test.until(() => test.current().stage === 'waiting')
        expect(test.current().proofAccepted).toBe(true)
        expect(
            test.requests.abandon(test.current().id, 'solo:hero', test.now)
        ).toBeNull()
        test.accept()
        test.enemy.alive = false
        expect(test.report()).toBeNull()
        expect(test.current().proofAccepted).toBe(true)
    })
})

describe('ordinary worker verification trips', () => {
    it.each(['farmer', 'lumberjack', 'miner'] as const)(
        'requires one actual %s work step and the complete return trip, without a market sale',
        (job) => {
            const test = new WorkerSimulation(job)
            test.publish()
            test.accept()
            test.player.inventory.push(createItemInstance('bone'))
            expect(test.report()).toBeNull()
            expect(
                test.requests.checkTurnIn(
                    test.current().id,
                    'solo:hero',
                    test.room,
                    test.now
                )
            ).not.toBeNull()
            test.until(() => test.current().stage === 'returning')
            expect(test.current().stage).toBe('returning')
            expect(test.worker.locationId).toBe(test.worksite.locationId)
            expect(test.reports).toHaveLength(1)
            expect(
                test.requests.checkTurnIn(
                    test.current().id,
                    'solo:hero',
                    test.room,
                    test.now
                )
            ).not.toBeNull()
            test.until(() => test.current().stage === 'ready')
            expect(test.worker.locationId).toBe(CENTER_LOCATION_ID)
            expect(test.commands).toHaveLength(job === 'lumberjack' ? 3 : 1)
            expect(test.commands[0]?.message.type).toBe(
                job === 'farmer' ? 'farm_action' : 'gather'
            )
            expect(test.commands[0]?.locationId).toBe(test.worksite.locationId)
            expect(test.commands[0]?.permitted).toBe(true)
            expect(test.reports).toEqual([
                expect.objectContaining({
                    actorId: test.worker.id,
                    targetId: test.clerk.id,
                }),
                expect.objectContaining({
                    actorId: test.worker.id,
                    targetId: test.clerk.id,
                }),
            ])
            expect(test.reports[0]?.text).toContain('замечена опасность')
            expect(test.reports[1]?.text).toContain('проверка прошла успешно')
            expect(
                test.requests.checkTurnIn(
                    test.current().id,
                    'solo:hero',
                    test.room,
                    test.now
                )
            ).toBeNull()
            expect(
                test.requests.allowsWork(test.worker.id, {
                    type: 'gather',
                    nodeId: test.node.id,
                })
            ).toBe(false)
            expect(test.requests.complete(test.current().id, 'solo:hero')).toBe(
                true
            )
            expect(test.requests.complete(test.current().id, 'solo:hero')).toBe(
                false
            )
            expect(
                test.requests.allowsWork(test.worker.id, {
                    type: 'gather',
                    nodeId: test.node.id,
                })
            ).toBe(true)
        }
    )
})

describe('worker claim lifecycle', () => {
    it('invalidates a completed trial when danger returns before payout, preserving the paid trophy', () => {
        const test = new WorkerSimulation('miner')
        test.publish()
        test.accept()
        test.player.inventory.push(createItemInstance('bone'))
        expect(test.report()).toBeNull()
        test.until(() => test.current().stage === 'ready')
        test.enemy.alive = true
        expect(
            test.requests.checkTurnIn(
                test.current().id,
                'solo:hero',
                test.room,
                test.now
            )
        ).toContain('снова опасно')
        expect(test.current()).toMatchObject({
            stage: 'waiting',
            proofAccepted: true,
        })
        expect(test.requests.complete(test.current().id, 'solo:hero')).toBe(
            false
        )
        expect(test.report()).toBeNull()
    })

    it('uses current assignees for the five minute orphan deadline and retains the proof', () => {
        const test = new WorkerSimulation('lumberjack')
        test.publish()
        test.accept()
        test.player.inventory.push(createItemInstance('bone'))
        expect(test.report()).toBeNull()
        test.enemy.alive = true
        test.until(() => test.current().stage === 'waiting')
        test.requests.setGroupMembers('solo:hero', new Set())
        const disconnectedAt = test.now
        test.requests.reconcile(
            test.characters,
            disconnectedAt + WORKER_REQUEST_ORPHAN_MS - 1
        )
        expect(test.requests.list()).toHaveLength(0)
        test.requests.reconcile(
            test.characters,
            disconnectedAt + WORKER_REQUEST_ORPHAN_MS
        )
        expect(test.requests.list()).toHaveLength(1)
        expect(test.current().proofAccepted).toBe(true)
        expect(test.requests.active('solo:hero', 'worker-request-1')).toBeNull()
    })

    it('pauses a temporarily dead worker and cancels only after that identity is removed', () => {
        const test = new WorkerSimulation('farmer')
        test.publish()
        test.accept()
        test.worker.alive = false
        test.tick()
        expect(test.current()).toMatchObject({
            stage: 'waiting',
            reason: 'Работник погиб и ожидает воскрешения.',
        })
        expect(test.report()).not.toBeNull()
        test.worker.alive = true
        test.tick()
        expect(test.current().stage).toBe('waiting')
        test.characters.delete(test.worker.id)
        test.requests.reconcile(test.characters, test.now)
        expect(test.current().stage).toBe('cancelled')
        expect(test.requests.active('solo:hero', 'worker-request-1')).toBeNull()
        expect(test.requests.complete(test.current().id, 'solo:hero')).toBe(
            false
        )
    })
})

describe('worker trial failures stay distinct from hostile danger', () => {
    it('does not accept arbitrary controller work or a remote command as a trial receipt', () => {
        const test = new WorkerSimulation('lumberjack')
        test.publish()
        const command: AdventureClientMessage = {
            type: 'gather',
            nodeId: test.node.id,
        }
        expect(test.requests.allowsWork(test.worker.id, command)).toBe(false)
        expect(
            test.requests.allowsWork(test.worker.id, 'worker_delivery')
        ).toBe(false)
        expect(
            test.room.requestAdventure(test.worker, command, test.now).accepted
        ).toBe(false)
        expect(test.current().stage).toBe('waiting')
        expect(test.requests.allowsWork(test.player.id, command)).toBe(true)
    })

    it('keeps a broken-tool or exhausted-source trial waiting instead of silently picking another map', () => {
        const test = new WorkerSimulation('lumberjack')
        test.publish()
        test.accept()
        test.player.inventory.push(createItemInstance('bone'))
        expect(test.report()).toBeNull()
        if (test.worker.equipment.weapon === undefined) {
            throw new Error('Missing fixture axe')
        }
        test.worker.equipment.weapon.durability = 0
        test.until(() => test.current().reason?.includes('инструмент') === true)
        expect(test.current().stage).toBe('working')
        expect(test.commands).toHaveLength(0)
        test.worker.equipment.weapon.durability = 100
        test.until(() => test.current().stage === 'ready')
        expect(test.commands).toHaveLength(3)
    })

    it('does not publish an incident while its clerk is absent', () => {
        const test = new WorkerSimulation('miner')
        test.characters.delete(test.clerk.id)
        test.tick()
        expect(test.current()).toMatchObject({
            stage: 'reporting',
            reason: 'Распорядитель сейчас недоступен.',
        })
        expect(test.requests.list()).toEqual([])
        test.characters.set(test.clerk.id, test.clerk)
        test.enemy.alive = false
        test.until(() => test.requests.list().length === 1)
    })
})
