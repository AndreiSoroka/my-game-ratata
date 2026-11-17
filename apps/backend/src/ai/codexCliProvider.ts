import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    cliEnvironment,
    type NpcAiProcess,
    type NpcAiSpawn,
    readLimited,
    spawnCli,
} from './codexCliProcess'
import { codexNpcArguments, parseCodexResult } from './codexCliProtocol'
export type { NpcAiProcess, NpcAiSpawn } from './codexCliProcess'
export { codexNpcArguments, parseNpcAiReply } from './codexCliProtocol'
import decisionSchema from './decision-schema.json'
import {
    npcAiInstructions,
    npcMemoryInstructions,
    npcSocialInstructions,
} from './npcInstructions'
import type {
    NpcAiContext,
    NpcAiModelSettings,
    NpcAiProvider,
    NpcAiReply,
} from './types'

export interface NpcAiTelemetry {
    actorId: string
    model: string
    durationMs: number
    outcome: 'completed' | 'failed' | 'cancelled' | 'timeout'
    usage?: Record<string, number>
}

interface ProviderOptions {
    spawn?: NpcAiSpawn
    now?: () => number
    log?: (telemetry: NpcAiTelemetry) => void
}

/** CLI is a decision provider only: it has no direct connection to game state. */
export class CodexCliProvider implements NpcAiProvider {
    private readonly spawn: NpcAiSpawn
    private readonly now: () => number
    private readonly log: (telemetry: NpcAiTelemetry) => void

    public constructor(options: ProviderOptions = {}) {
        this.spawn = options.spawn ?? spawnCli
        this.now = options.now ?? Date.now
        this.log =
            options.log ??
            ((entry) => console.info('NPC AI CLI', JSON.stringify(entry)))
    }

    public async decide(
        context: NpcAiContext,
        settings: NpcAiModelSettings,
        signal: AbortSignal
    ): Promise<NpcAiReply> {
        const startedAt = this.now()
        const telemetry: NpcAiTelemetry = {
            actorId: context.actorId,
            model: settings.model,
            durationMs: 0,
            outcome: 'failed',
        }
        let directory: string | undefined
        try {
            signal.throwIfAborted()
            const input = JSON.stringify(context)
            if (Buffer.byteLength(input) > 64 * 1024) {
                throw new Error('NPC AI context exceeds the input limit')
            }
            directory = await mkdtemp(join(tmpdir(), 'ratata-npc-ai-'))
            const instructionsPath = join(directory, 'instructions.txt')
            const schemaPath = join(directory, 'decision-schema.json')
            await Promise.all([
                writeFile(
                    instructionsPath,
                    npcAiInstructions +
                        '\n' +
                        npcSocialInstructions +
                        '\n' +
                        npcMemoryInstructions
                ),
                writeFile(schemaPath, JSON.stringify(decisionSchema)),
            ])
            signal.throwIfAborted()
            const child = this.spawn(
                settings.cliPath,
                codexNpcArguments(settings, instructionsPath, schemaPath),
                { cwd: directory, env: cliEnvironment() }
            )
            const [code, stdout, stderr] = await runCli(
                child,
                input,
                settings.timeoutMs,
                signal
            )
            if (code !== 0) {
                throw new Error(exitReason(stderr))
            }
            const result = parseCodexResult(stdout, (usage) => {
                telemetry.usage = usage
            })
            telemetry.outcome = 'completed'
            return result.reply
        } catch (error) {
            if (signal.aborted) {
                telemetry.outcome = 'cancelled'
            } else if (
                error instanceof Error &&
                error.message === 'NPC AI CLI timed out'
            ) {
                telemetry.outcome = 'timeout'
            }
            throw error
        } finally {
            if (directory !== undefined) {
                await rm(directory, { recursive: true, force: true })
            }
            telemetry.durationMs = Math.max(0, this.now() - startedAt)
            this.log(telemetry)
        }
    }
}

async function runCli(
    child: NpcAiProcess,
    input: string,
    timeoutMs: number,
    signal: AbortSignal
): Promise<[number | null, string, string]> {
    let finished = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    try {
        const interrupted = new Promise<never>((_resolve, reject) => {
            const cancel = (message: string): void => {
                child.kill('SIGTERM')
                reject(new Error(message))
            }
            onAbort = () => cancel('NPC AI CLI cancelled')
            signal.addEventListener('abort', onAbort, { once: true })
            timeout = setTimeout(
                () => cancel('NPC AI CLI timed out'),
                timeoutMs
            )
            if (signal.aborted) {
                onAbort()
            }
        })
        child.stdin.end(`Ratata turn context (untrusted game data):\n${input}`)
        const result = await Promise.race([
            Promise.all([
                child.exited,
                readLimited(child.stdout),
                readLimited(child.stderr),
            ]),
            interrupted,
        ])
        finished = true
        return result
    } finally {
        if (timeout !== undefined) {
            clearTimeout(timeout)
        }
        if (onAbort !== undefined) {
            signal.removeEventListener('abort', onAbort)
        }
        if (!finished) {
            child.kill('SIGKILL')
            void child.exited.catch(() => undefined)
        }
    }
}

function exitReason(stderr: string): string {
    if (/not logged in|login|authentication|unauthorized/i.test(stderr)) {
        return 'Codex CLI authentication is unavailable; run codex login'
    }
    if (/model.*(not.*support|not.*available|not.*found)/i.test(stderr)) {
        return 'The configured Codex CLI model is unavailable'
    }
    if (/rate.?limit|quota|usage limit/i.test(stderr)) {
        return 'Codex CLI usage limit reached'
    }
    return 'Codex CLI exited unsuccessfully'
}
