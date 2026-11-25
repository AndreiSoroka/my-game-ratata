import {
    type FarmPlotSnapshot,
    getWorldLocationDefinition,
    type ScenarioSearchKind,
} from '@my-game-ratata/contracts'

import { locationName } from '@/shared/lib/i18n'

export interface ScenarioVisibleTarget {
    kind: ScenarioSearchKind
    id: string
    label: string
    locationId?: string
}
export type ScenarioFarmPlot = Pick<FarmPlotSnapshot, 'id' | 'locationId' | 'name'>
export function scenarioTargetKey(target: { id: string; locationId?: string }): string {
    return JSON.stringify([target.locationId ?? null, target.id])
}
export function scenarioTargetLabel(target: ScenarioVisibleTarget): string {
    const location = target.locationId && getWorldLocationDefinition(target.locationId)
    return location ? `${target.label} · ${locationName(location.id, location.name)}` : target.label
}
