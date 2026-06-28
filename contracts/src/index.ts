export const CONTRACT_PROTOCOL_VERSION = '0.1.0'

export type ContractProtocolVersion = typeof CONTRACT_PROTOCOL_VERSION

export type ServiceName = 'backend' | 'frontend'

export interface ServiceHealth {
    checkedAt: string
    protocolVersion: ContractProtocolVersion
    service: ServiceName
    status: 'ok'
}

export interface PlayerIdentity {
    displayName: string
    id: string
}

export interface WorldPosition {
    x: number
    y: number
    z?: number
}
