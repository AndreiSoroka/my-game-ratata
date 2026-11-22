import type { AbilityId, PrayerActionId, PrayerMode } from './abilities'
import {
    type ExactHealthSnapshot,
    healthNeedsRestoration,
    healthPercent,
    type PercentHealthSnapshot,
} from './health'

export type ResourceSnapshot =
    ExactHealthSnapshot | (PercentHealthSnapshot & { hasCapacity: boolean })

export type ResourceCheck = 'ready' | 'mana' | 'energy'

/** Private affordability hints; commands always validate the current server state. */
export interface CharacterResourceChecks {
    abilities: Record<Exclude<AbilityId, PrayerActionId>, ResourceCheck>
    prayers: Record<PrayerActionId, Record<PrayerMode, ResourceCheck>>
    dash: ResourceCheck
    sow: ResourceCheck
    sowEnergyCost?: number
    plantEnergyCost?: number
    steal: ResourceCheck
}

export function resourceFillPercent(resource: ResourceSnapshot): number {
    return healthPercent(resource)
}

export function resourceNeedsRestoration(resource: ResourceSnapshot): boolean {
    return (
        (resource.kind === 'exact' || resource.hasCapacity) &&
        healthNeedsRestoration(resource)
    )
}
