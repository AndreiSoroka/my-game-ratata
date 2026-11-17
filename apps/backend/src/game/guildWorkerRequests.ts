import type {
    GuildQuestDefinition,
    WorkRequestSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GuildJob } from './guildRules'

export interface WorkerGuildGateway {
    list: () => GuildQuestDefinition[]
    active: (groupKey: string) => WorkRequestSnapshot | null
    accept: (
        requestId: string,
        groupKey: string,
        members: Set<string>,
        characters: Map<string, GameCharacter>,
        now: number
    ) => string | null
    report: (
        requestId: string,
        groupKey: string,
        actor: GameCharacter,
        now: number
    ) => string | null
    checkTurnIn: (
        requestId: string,
        groupKey: string,
        now: number
    ) => string | null
    complete: (requestId: string, groupKey: string) => boolean
    /** Executes payment only while the incident can commit its terminal transition. */
    settle?: (
        requestId: string,
        groupKey: string,
        payment: () => boolean
    ) => boolean
    abandon: (requestId: string, groupKey: string, now: number) => string | null
    moveGroup: (from: string, to: string) => void
    releaseGroup: (groupKey: string, now: number) => void
    refreshGroup?: (groupKey: string, members: ReadonlySet<string>) => void
    canContact?: (input: {
        groupKey: string
        requestId: string
        actor: GameCharacter
        npc: GameCharacter
        now: number
    }) => boolean
}

export function refreshWorkerJob(
    gateway: WorkerGuildGateway | undefined,
    job: GuildJob,
    key: string
): boolean {
    if (job.definition.workRequest === undefined || job.completed) {
        return true
    }
    const request = gateway?.active(key)
    if (request?.id !== job.definition.id) {
        return false
    }
    job.definition = { ...job.definition, workRequest: request }
    job.progress = request.stage === 'ready' ? job.definition.goal : 0
    return true
}

export function workerContactAllowed(
    gateway: WorkerGuildGateway | undefined,
    job: GuildJob | undefined,
    input: {
        groupKey: string
        requestId?: string | undefined
        actor: GameCharacter
        npc: GameCharacter
        now: number
    }
): boolean {
    const requestId =
        input.requestId ??
        (job?.completed === true ? undefined : job?.definition.workRequest?.id)
    if (requestId === undefined || gateway?.canContact === undefined) {
        return true
    }
    return gateway.canContact({ ...input, requestId })
}

export function checkWorkerTurnIn(
    gateway: WorkerGuildGateway | undefined,
    job: GuildJob,
    key: string,
    now: number
): string | null {
    if (job.definition.workRequest === undefined) {
        return null
    }
    return (
        gateway?.checkTurnIn(job.definition.id, key, now) ??
        (gateway === undefined ? 'Обращение недоступно.' : null)
    )
}

export function acceptWorkerJob(
    gateway: WorkerGuildGateway | undefined,
    definition: GuildQuestDefinition,
    key: string,
    members: Set<string>,
    characters: Map<string, GameCharacter>,
    now: number
): string | null {
    if (definition.workRequest === undefined) {
        return null
    }
    return (
        gateway?.accept(definition.id, key, members, characters, now) ??
        (gateway === undefined ? 'Обращение недоступно.' : null)
    )
}
