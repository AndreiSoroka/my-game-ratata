import type { FarmPlotDefinition } from './farms'

export type FarmPlotPhase = 'bare' | 'growing' | 'ripe'
export type FarmAction = 'sow' | 'harvest'

export interface FarmPlotSnapshot extends Omit<
    FarmPlotDefinition,
    'initiallyRipe'
> {
    phase: FarmPlotPhase
    readyAt: number
}

export interface FarmClientMessage {
    type: 'farm_action'
    plotId: string
    action: FarmAction
}

export const FARM_GROW_MS = 45_000
export const FARM_SOW_ENERGY = 5
export const FARM_HARVEST_GRAIN = 3
export const FARM_ACTION_COOLDOWN_MS = 800
export const FARM_INTERACTION_RANGE = 48
