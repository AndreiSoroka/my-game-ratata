import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import decisionSchema from './decision-schema.json'
import { npcCityStoryInstructions } from './npcCityStoryContext'
import {
    type NpcAiProcess,
    type NpcAiSpawn,
    readLimited,
    spawnCli,
} from './npcCliProcess'
import { npcErrandInstructions } from './npcErrandInstructions'
import { npcIdentityInstructions } from './npcIdentityInstructions'
import {
    npcAiInstructions,
    npcMemoryInstructions,
    npcSocialInstructions,
} from './npcInstructions'
import { npcQuestInvitationInstructions } from './npcQuestInvitationInstructions'
import { npcSpeechInstructions } from './npcSpeechInstructions'
import type {
    NpcAiContext,
    NpcAiModelSettings,
    NpcAiProvider,
    NpcAiReply,
} from './types'

const systemInstructions = [
    npcAiInstructions,
    npcSocialInstructions,
    npcMemoryInstructions,
    npcErrandInstructions,
    npcSpeechInstructions,
    npcIdentityInstructions,
    npcQuestInvitationInstructions,
    npcCityStoryInstructions,
].join('\n')
const decisionSchemaJson = JSON.stringify(decisionSchema)

export interface NpcAiTelemetry {
    actorId: string
    model: string
    durationMs: number
    outcome: 'completed' | 'failed' | 'cancelled' | 'timeout'
    usage?: Record<string, number>
}

export interface NpcCliProviderOptions {
    spawn?: NpcAiSpawn
    now?: () => number
    log?: (telemetry: NpcAiTelemetry) => void
}

interface NpcCliProtocol {
    environment(): NodeJS.ProcessEnv
    instructionSuffix?: string
    arguments(
        settings: NpcAiModelSettings,
        instructionsPath: string,
        schemaJson: string
    ): string[] | Promise<string[]>
    parse(
        stdout: string,
        onUsage: (usage: Record<string, number>) => void
    ): NpcAiReply
    exitReason(stderr: string, stdout: string): string
}

/** CLI is a decision provider only: it has no direct connection to game state. */
export class NpcCliProvider implements NpcAiProvider {
    private readonly spawn: NpcAiSpawn
    private readonly now: () => number
    private readonly log: (telemetry: NpcAiTelemetry) => void
    private readonly instructions: string

    protected constructor(
        private readonly protocol: NpcCliProtocol,
        options: NpcCliProviderOptions
    ) {
        this.spawn = options.spawn ?? spawnCli
        this.now = options.now ?? Date.now
        this.log =
            options.log ??
            ((entry) => console.info('NPC AI CLI', JSON.stringify(entry)))
        this.instructions =
            this.protocol.instructionSuffix === undefined
                ? systemInstructions
                : `${systemInstructions}\n${this.protocol.instructionSuffix}`
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
            const [, args] = await Promise.all([
                writeFile(instructionsPath, this.instructions),
                this.protocol.arguments(
                    settings,
                    instructionsPath,
                    decisionSchemaJson
                ),
            ])
            signal.throwIfAborted()
            const child = this.spawn(settings.cliPath, args, {
                cwd: directory,
                env: this.protocol.environment(),
            })
            const [code, stdout, stderr] = await runCli(
                child,
                input,
                settings.timeoutMs,
                signal
            )
            if (code !== 0) {
                throw new Error(this.protocol.exitReason(stderr, stdout))
            }
            const reply = this.protocol.parse(stdout, (usage) => {
                telemetry.usage = usage
            })
            telemetry.outcome = 'completed'
            return reply
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
