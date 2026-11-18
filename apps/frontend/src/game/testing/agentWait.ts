import type { AdventureQuestStatus, ItemId } from '@my-game-ratata/contracts'

import { agentAvailable, agentMapReady } from './agentAvailability'
import type { AgentObservation } from './agentObservation'
import type { RatataTestState } from './testInterface'

export type AgentCondition =
    | { type: 'tick'; after: number }
    | { type: 'location'; locationId: string }
    | { type: 'quest'; status: AdventureQuestStatus }
    | { type: 'dialogue'; npcId: string | null }
    | { type: 'inventory'; itemId: ItemId; atLeast: number }
    | { type: 'chest'; chestId: string | null }
    | { type: 'notice'; after: number }
    | { type: 'idle' }

export interface AgentWaitOptions {
    timeoutMs?: number
}

export interface AgentActionOptions extends AgentWaitOptions {
    until?: AgentCondition
}

export interface AgentWaitResult {
    status: 'updated' | 'condition_met' | 'timeout' | 'cancelled' | 'unavailable'
    reason: string
    elapsedMs: number
    observation: AgentObservation
}

export function validateAgentWait(condition: AgentCondition, options: AgentWaitOptions): number {
    const timeout = options.timeoutMs ?? 5_000
    if (!Number.isFinite(timeout) || timeout < 0 || timeout > 60_000) {
        throw new Error('Timeout must be between 0 and 60000 ms')
    }
    if (!validCondition(condition)) {
        throw new Error('Invalid wait condition; see docs/agent-playtesting.md')
    }
    return timeout
}

function validCondition(condition: AgentCondition): boolean {
    if (!condition || typeof condition !== 'object') return false
    switch (condition.type) {
        case 'tick':
        case 'notice':
            return validThreshold(condition.after)
        case 'inventory':
            return validInventoryCondition(condition)
        case 'quest':
            return ['available', 'active', 'ready', 'completed', 'cancelled'].includes(
                condition.status
            )
        case 'location':
            return typeof condition.locationId === 'string'
        case 'dialogue':
            return optionalId(condition.npcId)
        case 'chest':
            return optionalId(condition.chestId)
        case 'idle':
            return true
        default:
            return false
    }
}

function validThreshold(value: number): boolean {
    return Number.isFinite(value) && value >= -1
}
function validInventoryCondition(
    condition: Extract<AgentCondition, { type: 'inventory' }>
): boolean {
    return (
        typeof condition.itemId === 'string' &&
        Number.isSafeInteger(condition.atLeast) &&
        condition.atLeast >= 0
    )
}
function optionalId(value: string | null): boolean {
    return value === null || typeof value === 'string'
}

type ConditionReaders = {
    [K in AgentCondition['type']]: (
        state: RatataTestState,
        condition: Extract<AgentCondition, { type: K }>
    ) => boolean
}
const conditionReaders: ConditionReaders = {
    tick: (state, condition) => (state.snapshot?.tick ?? -1) > condition.after,
    location: (state, condition) => state.location?.id === condition.locationId,
    quest: (state, condition) => state.snapshot?.adventure?.quest.status === condition.status,
    dialogue: (state, condition) =>
        (state.snapshot?.adventure?.dialogue?.npcId ?? null) === condition.npcId,
    chest: (state, condition) => (state.snapshot?.chest?.chestId ?? null) === condition.chestId,
    notice: (state, condition) => (state.snapshot?.adventure?.noticeId ?? -1) > condition.after,
    inventory: (state, condition) =>
        (state.player?.inventory
            .filter((item) => item.itemId === condition.itemId)
            .reduce((total, item) => total + (item.quantity ?? 1), 0) ?? 0) >= condition.atLeast,
    idle: (state) =>
        Boolean(
            state.player?.alive &&
            state.player.path.length === 0 &&
            state.player.velocity.x === 0 &&
            state.player.velocity.y === 0
        ),
}

export function matchesAgentCondition<C extends AgentCondition>(
    state: RatataTestState,
    condition: C
): boolean {
    const reader = conditionReaders[condition.type] as (
        state: RatataTestState,
        condition: C
    ) => boolean
    return reader(state, condition)
}

/** Poll received state, never infer server acceptance from a successful socket send. */
export function createAgentWaiter(options: {
    getState: () => RatataTestState
    observe: () => AgentObservation
}) {
    const pending = new Set<() => void>()
    let disposed = false
    const waitFor = (
        condition: AgentCondition,
        waitOptions: AgentWaitOptions = {},
        matchedStatus: 'updated' | 'condition_met' = 'condition_met',
        afterTick?: number
    ): Promise<AgentWaitResult> => {
        const timeout = validateAgentWait(condition, waitOptions)
        const started = Date.now()
        const identity = options.getState().localPlayerId
        return new Promise((resolve) => {
            let timer: ReturnType<typeof setTimeout> | undefined
            const finish = (status: AgentWaitResult['status'], reason: string) => {
                clearTimeout(timer)
                pending.delete(cancel)
                resolve({
                    status,
                    reason,
                    elapsedMs: Date.now() - started,
                    observation: options.observe(),
                })
            }
            const cancel = () => finish('cancelled', 'Observation wait cancelled')
            const poll = () => {
                const state = options.getState()
                if (disposed) return cancel()
                if (!agentAvailable(state) || state.localPlayerId !== identity) {
                    return finish(
                        'unavailable',
                        'Player disconnected, died, retired or identity changed'
                    )
                }
                if (
                    agentMapReady(state) &&
                    hasNewSnapshot(state, afterTick) &&
                    matchesAgentCondition(state, condition)
                ) {
                    return finish(
                        matchedStatus,
                        matchedStatus === 'updated'
                            ? 'New snapshot observed; this does not acknowledge command success'
                            : 'Requested state condition observed'
                    )
                }
                if (Date.now() - started >= timeout)
                    return finish('timeout', 'Condition not observed before deadline')
                timer = setTimeout(poll, 50)
            }
            pending.add(cancel)
            poll()
        })
    }
    const cancel = () => {
        for (const stop of pending) stop()
    }
    return {
        waitFor,
        cancel,
        dispose: () => {
            disposed = true
            cancel()
        },
    }
}

function hasNewSnapshot(state: RatataTestState, afterTick?: number): boolean {
    return afterTick === undefined || (state.snapshot?.tick ?? -1) > afterTick
}
