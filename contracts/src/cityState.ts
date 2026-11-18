export type CityBellState = 'silent' | 'prepared' | 'active'

/** Public resolved city facts; personal memories cannot override them. */
export interface CityStateSnapshot {
    locationId: string
    bellState: CityBellState
    activationId?: string
}
