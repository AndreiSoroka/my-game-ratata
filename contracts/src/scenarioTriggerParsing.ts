import {
    integer,
    object,
    onlyKeys,
    validFarmPlot,
    validId,
} from './scenarioParsingValues'
import type { ScenarioTrigger } from './scenarios'

export function parseScenarioTrigger(
    input: unknown
): ScenarioTrigger | undefined {
    const record = object(input)
    if (record === undefined) {
        return undefined
    }
    switch (record['kind']) {
        case 'enemy_visible':
        case 'friendly_nearby':
            return parseNearbyTrigger(record, record['kind'])
        case 'inventory_full':
            return onlyKeys(record, ['kind'])
                ? { kind: 'inventory_full' }
                : undefined
        case 'plot_ripe':
            return parsePlotTrigger(record)
        case 'step_result':
            return parseResultTrigger(record)
        default:
            return undefined
    }
}
function parseNearbyTrigger(
    record: Record<string, unknown>,
    kind: 'enemy_visible' | 'friendly_nearby'
): ScenarioTrigger | undefined {
    const { distanceTiles, onlyWhenNotFollowing } = record
    if (!integer(distanceTiles, 1, 64)) {
        return undefined
    }
    if (kind === 'enemy_visible') {
        return onlyKeys(record, ['kind', 'distanceTiles'])
            ? { kind, distanceTiles }
            : undefined
    }
    if (
        !onlyKeys(record, ['kind', 'distanceTiles', 'onlyWhenNotFollowing']) ||
        (onlyWhenNotFollowing !== undefined &&
            typeof onlyWhenNotFollowing !== 'boolean')
    ) {
        return undefined
    }
    return {
        kind,
        distanceTiles,
        ...(onlyWhenNotFollowing === undefined ? {} : { onlyWhenNotFollowing }),
    }
}
function parsePlotTrigger(
    record: Record<string, unknown>
): ScenarioTrigger | undefined {
    const { plotId, locationId } = record
    return onlyKeys(record, ['kind', 'plotId', 'locationId']) &&
        typeof plotId === 'string' &&
        typeof locationId === 'string' &&
        validFarmPlot(plotId, locationId)
        ? { kind: 'plot_ripe', plotId, locationId }
        : undefined
}
function parseResultTrigger(
    record: Record<string, unknown>
): ScenarioTrigger | undefined {
    const { stepId, status } = record
    return onlyKeys(record, ['kind', 'stepId', 'status']) &&
        validId(stepId) &&
        (status === 'succeeded' || status === 'failed')
        ? { kind: 'step_result', stepId, status }
        : undefined
}
