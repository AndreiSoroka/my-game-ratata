import {
    type ScenarioDestination,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import {
    object,
    onlyKeys,
    optionalId,
    optionalItem,
    searchKind,
    validId,
} from './scenarioParsingValues'

export function parseScenarioDestination(
    value: unknown
): ScenarioDestination | undefined {
    const record = object(value)
    if (record === undefined) {
        return undefined
    }
    switch (record['kind']) {
        case 'marker':
            return onlyKeys(record, ['kind', 'markerId']) &&
                validId(record['markerId'])
                ? { kind: 'marker', markerId: record['markerId'] }
                : undefined
        case 'point':
            return parsePoint(record)
        case 'visible':
            return parseVisible(record)
        default:
            return undefined
    }
}

function parsePoint(
    record: Record<string, unknown>
): ScenarioDestination | undefined {
    if (!onlyKeys(record, ['kind', 'locationId', 'position'])) {
        return undefined
    }
    const locationId = record['locationId']
    if (
        typeof locationId !== 'string' ||
        !WORLD_LOCATION_DEFINITIONS.some(
            (location) => location.id === locationId
        )
    ) {
        return undefined
    }
    const position = object(record['position'])
    if (position === undefined || !onlyKeys(position, ['x', 'y'])) {
        return undefined
    }
    const { x, y } = position
    if (!coordinate(x) || !coordinate(y)) {
        return undefined
    }
    return { kind: 'point', locationId, position: { x, y } }
}

function parseVisible(
    record: Record<string, unknown>
): ScenarioDestination | undefined {
    if (!onlyKeys(record, ['kind', 'target', 'targetId', 'itemId'])) {
        return undefined
    }
    if (
        !searchKind(record['target']) ||
        !optionalId(record['targetId']) ||
        !optionalItem(record['itemId'])
    ) {
        return undefined
    }
    return {
        kind: 'visible',
        target: record['target'],
        ...(record['targetId'] === undefined
            ? {}
            : { targetId: record['targetId'] }),
        ...(record['itemId'] === undefined ? {} : { itemId: record['itemId'] }),
    }
}

function coordinate(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 100_000
    )
}
