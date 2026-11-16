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
export const FARM_SOW_SEEDS = 1
export const FARM_HARVEST_GRAIN = 3
export const FARM_HARVEST_SEED_DROPS = [
    { quantity: 0, weight: 50 },
    { quantity: 1, weight: 30 },
    { quantity: 2, weight: 15 },
    { quantity: 3, weight: 5 },
] as const
export const FARM_ACTION_COOLDOWN_MS = 800
export const FARM_INTERACTION_RANGE = 48
