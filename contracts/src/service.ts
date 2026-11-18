export const CONTRACT_PROTOCOL_VERSION = '0.10.0'

export type ContractProtocolVersion = typeof CONTRACT_PROTOCOL_VERSION

export type ServiceName = 'backend' | 'frontend'

export interface ServiceHealth {
    checkedAt: string
    protocolVersion: ContractProtocolVersion
    service: ServiceName
    status: 'ok'
}
