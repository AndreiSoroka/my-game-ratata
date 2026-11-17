import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type { AgentDecision } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    defaultNpcAiLogPath,
    type NpcAiDiagnosticRecord,
    NpcAiDiagnostics,
} from '../src/ai/diagnostics'

const directories: string[] = []
afterEach(async () => {
    await Promise.all(
        directories
            .splice(0)
            .map((directory) => rm(directory, { recursive: true, force: true }))
    )
})

function event(
    overrides: Partial<NpcAiDiagnosticRecord> = {}
): NpcAiDiagnosticRecord {
    return {
        actorId: 'npc_magic_slime_1',
        taskId: 'task-1',
        request: 'Узнай, что продаёт торговец.',
        category: 'model_feedback',
        diagnostic: {
            kind: 'missing_capability',
            capability: 'merchant_offer',
            detail: 'Нужна возможность узнать ассортимент.',
            attempted: 'Подойти и поговорить с торговцем.',
        },
        at: 1000,
        ...overrides,
    }
}

function parse(line: string): Record<string, unknown> {
    return JSON.parse(line) as Record<string, unknown>
}

describe('local NPC AI diagnostic evidence', () => {
    it('separates model feedback from server failures and appends to a real local JSONL file', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'ratata-ai-log-test-'))
        directories.push(directory)
        const path = join(directory, 'nested', 'npc-ai.jsonl')
        const logger = new NpcAiDiagnostics({ path, worldSessionId: 'world-a' })
        logger.record(event())
        logger.record(
            event({
                category: 'action_rejected',
                action: { type: 'interact', targetId: 'merchant' },
                reason: 'Target is out of reach',
                receiptId: 'action-1',
                at: 2000,
            })
        )
        await logger.flush()
        const entries = (await readFile(path, 'utf8'))
            .trimEnd()
            .split('\n')
            .map(parse)
        expect(entries).toHaveLength(2)
        expect(entries[0]).toMatchObject({
            version: 1,
            worldSessionId: 'world-a',
            source: 'model',
            category: 'model_feedback',
            actorId: 'npc_magic_slime_1',
            request: 'Узнай, что продаёт торговец.',
        })
        expect(entries[1]).toMatchObject({
            source: 'server',
            category: 'action_rejected',
            receiptId: 'action-1',
            reason: 'Target is out of reach',
            action: { type: 'interact', targetId: 'merchant' },
        })
        const resumed = new NpcAiDiagnostics({
            path,
            worldSessionId: 'world-b',
        })
        resumed.record(event())
        await resumed.flush()
        expect(
            (await readFile(path, 'utf8')).trimEnd().split('\n')
        ).toHaveLength(3)
    })

    it('orders asynchronous writes without overlapping them', async () => {
        const entries: string[] = []
        let releaseFirst: (() => void) | undefined
        const firstWrite = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        let active = 0
        const logger = new NpcAiDiagnostics({
            sink: async (line) => {
                active += 1
                expect(active).toBe(1)
                entries.push(line)
                if (entries.length === 1) {
                    await firstWrite
                }
                active -= 1
            },
        })
        for (let number = 0; number < 3; number += 1) {
            logger.record(event({ taskId: `task-${String(number)}` }))
        }
        await Promise.resolve()
        expect(entries).toHaveLength(1)
        releaseFirst?.()
        await logger.flush()
        expect(entries.map((line) => parse(line)['taskId'])).toEqual([
            'task-0',
            'task-1',
            'task-2',
        ])
    })

    it('deduplicates repeated outcomes despite new timestamps and receipts', async () => {
        const lines: string[] = []
        const logger = new NpcAiDiagnostics({
            sink: (line) => {
                lines.push(line)
                return Promise.resolve()
            },
            maxDedupEntries: 2,
        })
        logger.record(event({ receiptId: 'receipt-1' }))
        logger.record(event({ receiptId: 'receipt-2', at: 2000 }))
        await logger.flush()
        expect(lines).toHaveLength(1)
        logger.record(event({ taskId: 'task-2' }))
        logger.record(event({ taskId: 'task-3' }))
        logger.record(event())
        await logger.flush()
        expect(lines).toHaveLength(4)
    })
})

describe('bounded diagnostic storage', () => {
    it('bounds queued work and permits a skipped record once storage catches up', async () => {
        const lines: string[] = []
        const warn = vi.fn()
        const logger = new NpcAiDiagnostics({
            maxQueuedEntries: 2,
            warn,
            sink: (line) => {
                lines.push(line)
                return Promise.resolve()
            },
        })
        logger.record(event({ taskId: 'task-1' }))
        logger.record(event({ taskId: 'task-2' }))
        logger.record(event({ taskId: 'task-3' }))
        logger.record(event({ taskId: 'task-4' }))
        expect(warn).toHaveBeenCalledTimes(1)
        await logger.flush()
        expect(lines).toHaveLength(2)
        logger.record(event({ taskId: 'task-3' }))
        await logger.flush()
        expect(lines).toHaveLength(3)
    })

    it('contains write failures and retries the same evidence on a later record', async () => {
        const sink = vi
            .fn<(line: string) => Promise<void>>()
            .mockRejectedValueOnce(new Error('Broken storage'))
            .mockResolvedValue(undefined)
        const warn = vi.fn()
        const logger = new NpcAiDiagnostics({ sink, warn })
        logger.record(event())
        await expect(logger.flush()).resolves.toBeUndefined()
        expect(warn).toHaveBeenCalledWith(
            'NPC AI diagnostics could not be written'
        )
        logger.record(event())
        await logger.flush()
        expect(sink).toHaveBeenCalledTimes(2)
    })

    it('retains bounded command metadata instead of arbitrary snapshots and credentials', async () => {
        const lines: string[] = []
        const logger = new NpcAiDiagnostics({
            sink: (line) => {
                lines.push(line)
                return Promise.resolve()
            },
        })
        const action = {
            type: 'move_to',
            target: { x: 80, y: 144 },
            token: 'do-not-record',
            snapshot: { inventory: ['private'] },
        } as AgentDecision
        logger.record(
            event({
                action,
                request: 'x'.repeat(1000),
                reason: 'y'.repeat(2000),
            })
        )
        await logger.flush()
        const entry = parse(lines[0] ?? '')
        expect(entry['action']).toEqual({
            type: 'move_to',
            target: { x: 80, y: 144 },
        })
        expect(entry['request']).toBe('x'.repeat(400))
        expect(entry['reason']).toBe('y'.repeat(1000))
        expect(lines[0]).not.toContain('do-not-record')
        expect(lines[0]).not.toContain('private')
    })
})

it('resolves the same ignored log path from repository and backend working directories', () => {
    const root = resolve(process.cwd(), '../..')
    expect(defaultNpcAiLogPath(root)).toBe(
        join(root, 'apps/backend/logs/npc-ai.jsonl')
    )
    expect(defaultNpcAiLogPath(join(root, 'apps/backend'))).toBe(
        defaultNpcAiLogPath(root)
    )
})
