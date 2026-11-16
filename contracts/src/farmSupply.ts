export interface FarmSupplyClientMessage {
    type: 'farm_supply'
    npcId: string
    plotId: string
    requestId: string
}

export const FARM_WORK_CYCLE_MS = 600_000
export const FARM_WORK_GRAIN = 6
