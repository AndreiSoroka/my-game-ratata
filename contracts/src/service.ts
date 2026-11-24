export const CONTRACT_PROTOCOL_VERSION = '0.17.0'

export type ContractProtocolVersion = typeof CONTRACT_PROTOCOL_VERSION

export type ServiceName = 'backend' | 'frontend'

export interface ServiceHealth {
    checkedAt: string
    protocolVersion: ContractProtocolVersion
    service: ServiceName
    status: 'ok'
}

export interface GameReadiness {
    state: 'checking' | 'ai_unavailable' | 'ready'
}

export const worldEmptyModes = [
    'online_ai',
    'always',
    'paused_when_empty',
] as const

export type WorldEmptyMode = (typeof worldEmptyModes)[number]

export const DEFAULT_WORLD_EMPTY_MODE: WorldEmptyMode = 'online_ai'

export function isWorldEmptyMode(value: unknown): value is WorldEmptyMode {
    return worldEmptyModes.some((mode) => mode === value)
}
