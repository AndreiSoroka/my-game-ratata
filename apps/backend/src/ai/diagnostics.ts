import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import type { AgentDecision } from '@my-game-ratata/contracts'

import type { NpcAiDiagnostic } from './types'

export interface NpcAiDiagnosticRecord {
    actorId: string
    taskId: string | null
    request: string
    category:
        | 'model_feedback'
        | 'action_rejected'
        | 'action_started'
        | 'action_completed'
        | 'action_failed'
        | 'provider_error'
        | 'task_limit'
        | 'request_status'
    action?: AgentDecision
    diagnostic?: NpcAiDiagnostic
    reason?: string
    receiptId?: string
    at: number
}

export interface NpcAiDiagnosticsOptions {
    path?: string
    sink?: (line: string) => Promise<void>
    worldSessionId?: string
    warn?: (message: string) => void
    maxQueuedEntries?: number
    maxDedupEntries?: number
}

/** Local feedback is diagnostic evidence, never an instruction or game outcome. */
export class NpcAiDiagnostics {
    public readonly worldSessionId: string
    public readonly path: string
    private readonly sink: (line: string) => Promise<void>
    private readonly warn: (message: string) => void
    private readonly maxQueuedEntries: number
    private readonly maxDedupEntries: number
    private readonly recorded = new Set<string>()
    private queue: Promise<void> = Promise.resolve()
    private pending = 0
    private warnedAboutOverflow = false

    public constructor(options: NpcAiDiagnosticsOptions = {}) {
        this.worldSessionId = options.worldSessionId ?? randomUUID()
        this.path = options.path ?? defaultNpcAiLogPath()
        this.sink =
            options.sink ??
            (async (line) => {
                await mkdir(dirname(this.path), { recursive: true })
                await appendFile(this.path, line, 'utf8')
            })
        this.warn = options.warn ?? ((message) => console.warn(message))
        this.maxQueuedEntries = boundedLimit(options.maxQueuedEntries, 128)
        this.maxDedupEntries = boundedLimit(options.maxDedupEntries, 2_048)
    }

    public record(record: NpcAiDiagnosticRecord): void {
        const entry = diagnosticEntry(record)
        const key = JSON.stringify(
            Object.fromEntries(
                Object.entries(entry).filter(
                    ([name]) =>
                        name !== 'at' &&
                        (record.category === 'action_completed' ||
                            name !== 'receiptId')
                )
            )
        )
        if (this.recorded.has(key)) {
            return
        }
        if (this.pending >= this.maxQueuedEntries) {
            if (!this.warnedAboutOverflow) {
                this.warnSafely(
                    'NPC AI diagnostics queue is full; entry skipped'
                )
                this.warnedAboutOverflow = true
            }
            return
        }
        this.remember(key)
        const line = `${JSON.stringify({
            version: 1,
            worldSessionId: this.worldSessionId,
            ...entry,
        })}\n`
        this.pending += 1
        this.queue = this.queue
            .then(() => this.sink(line))
            .catch(() => {
                this.recorded.delete(key)
                this.warnSafely('NPC AI diagnostics could not be written')
            })
            .finally(() => {
                this.pending -= 1
                this.warnedAboutOverflow = false
            })
    }

    public async flush(): Promise<void> {
        await this.queue
    }

    private remember(key: string): void {
        if (this.recorded.size >= this.maxDedupEntries) {
            const oldest = this.recorded.values().next().value
            if (oldest !== undefined) {
                this.recorded.delete(oldest)
            }
        }
        this.recorded.add(key)
    }

    private warnSafely(message: string): void {
        try {
            this.warn(message)
        } catch {
            // A broken diagnostic destination must not stop the game simulation.
        }
    }
}

export function defaultNpcAiLogPath(cwd = process.cwd()): string {
    let directory = resolve(cwd)
    for (;;) {
        if (
            existsSync(join(directory, 'bun.lock')) &&
            existsSync(join(directory, 'apps/backend/package.json'))
        ) {
            return join(directory, 'apps/backend/logs/npc-ai.jsonl')
        }
        const parent = dirname(directory)
        if (parent === directory) {
            return resolve(cwd, 'apps/backend/logs/npc-ai.jsonl')
        }
        directory = parent
    }
}

function boundedLimit(input: number | undefined, fallback: number): number {
    return input !== undefined &&
        Number.isInteger(input) &&
        input > 0 &&
        input <= 10_000
        ? input
        : fallback
}

function diagnosticEntry(record: NpcAiDiagnosticRecord) {
    return {
        at: record.at,
        actorId: record.actorId.slice(0, 100),
        taskId: record.taskId?.slice(0, 200) ?? null,
        request: record.request.slice(0, 400),
        category: record.category,
        source: record.category === 'model_feedback' ? 'model' : 'server',
        ...(record.action === undefined
            ? {}
            : { action: actionSummary(record.action) }),
        ...(record.diagnostic === undefined
            ? {}
            : {
                  diagnostic: {
                      kind: record.diagnostic.kind,
                      capability: record.diagnostic.capability.slice(0, 120),
                      detail: record.diagnostic.detail.slice(0, 1_000),
                      attempted: record.diagnostic.attempted.slice(0, 500),
                  },
              }),
        ...(record.reason === undefined
            ? {}
            : { reason: record.reason.slice(0, 1_000) }),
        ...(record.receiptId === undefined
            ? {}
            : { receiptId: record.receiptId.slice(0, 200) }),
    }
}

/** Only command metadata is retained; arbitrary input properties are discarded. */
function actionSummary(action: AgentDecision): Record<string, unknown> {
    const result: Record<string, unknown> = { type: action.type }
    if ('targetId' in action) {
        result['targetId'] = action.targetId?.slice(0, 100) ?? null
    }
    if (action.type === 'move_to') {
        result['target'] = { x: action.target.x, y: action.target.y }
    }
    if (action.type === 'guide') {
        result['targetKey'] = action.targetKey.slice(0, 100)
    }
    if (action.type === 'dialogue_choice') {
        result['choiceId'] = action.choiceId.slice(0, 100)
    }
    return result
}
