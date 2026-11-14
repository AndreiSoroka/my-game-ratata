import {
    ITEM_DEFINITIONS,
    type ScenarioResourceKind,
    type ScenarioStep,
} from '@my-game-ratata/contracts'

import { parseScenarioDestination } from './scenarioDestinationParsing'
import {
    integer,
    itemId,
    object,
    onlyKeys,
    optionalId,
    optionalItem,
    searchKind,
    validId,
} from './scenarioParsingValues'

export function parseScenarioStep(value: unknown): ScenarioStep | undefined {
    const record = object(value)
    if (record === undefined || !validId(record['id'])) {
        return undefined
    }
    const id = record['id']
    switch (record['kind']) {
        case 'go':
            return parseGo(record, id)
        case 'search':
            return parseSearch(record, id)
        case 'gather':
            return parseGather(record, id)
        case 'attack':
            return onlyKeys(record, ['id', 'kind'])
                ? { id, kind: 'attack' }
                : undefined
        case 'pickup':
            return parsePickup(record, id)
        case 'deposit':
            return parseDeposit(record, id)
        case 'wait':
            return parseWait(record, id)
        case 'recover':
            return parseRecover(record, id)
        default:
            return undefined
    }
}
function parseWait(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    return onlyKeys(record, ['id', 'kind', 'durationMs']) &&
        integer(record['durationMs'], 0, 3_600_000)
        ? { id, kind: 'wait', durationMs: record['durationMs'] }
        : undefined
}
function parseGo(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    if (!onlyKeys(record, ['id', 'kind', 'destination'])) {
        return undefined
    }
    const destination = parseScenarioDestination(record['destination'])
    return destination === undefined
        ? undefined
        : { id, kind: 'go', destination }
}
function parseSearch(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    if (
        !onlyKeys(record, ['id', 'kind', 'target', 'itemId']) ||
        !searchKind(record['target']) ||
        !optionalItem(record['itemId'])
    ) {
        return undefined
    }
    return {
        id,
        kind: 'search',
        target: record['target'],
        ...(record['itemId'] === undefined ? {} : { itemId: record['itemId'] }),
    }
}
function parseGather(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    if (
        !onlyKeys(record, ['id', 'kind', 'resource', 'amount']) ||
        !resourceKind(record['resource'])
    ) {
        return undefined
    }
    const amount = record['amount']
    return amount === 'depleted' || integer(amount, 1, 10_000)
        ? { id, kind: 'gather', resource: record['resource'], amount }
        : undefined
}
function parsePickup(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    return onlyKeys(record, ['id', 'kind', 'itemId']) &&
        optionalItem(record['itemId'])
        ? {
              id,
              kind: 'pickup',
              ...(record['itemId'] === undefined
                  ? {}
                  : { itemId: record['itemId'] }),
          }
        : undefined
}
function parseDeposit(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    if (
        !onlyKeys(record, ['id', 'kind', 'chestId', 'mode', 'itemIds']) ||
        !optionalId(record['chestId'])
    ) {
        return undefined
    }
    const mode = record['mode']
    const items = record['itemIds']
    if (mode !== 'all' && mode !== 'acquired') {
        return undefined
    }
    if (
        !Array.isArray(items) ||
        items.length > Object.keys(ITEM_DEFINITIONS).length ||
        !items.every(itemId)
    ) {
        return undefined
    }
    return {
        id,
        kind: 'deposit',
        mode,
        itemIds: [...new Set(items)],
        ...(record['chestId'] === undefined
            ? {}
            : { chestId: record['chestId'] }),
    }
}
function parseRecover(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    if (
        !onlyKeys(record, ['id', 'kind', 'resource', 'atLeast']) ||
        !integer(record['atLeast'], 1, 10_000)
    ) {
        return undefined
    }
    const resource = record['resource']
    return resource === 'energy' || resource === 'mana' || resource === 'hp'
        ? { id, kind: 'recover', resource, atLeast: record['atLeast'] }
        : undefined
}
function resourceKind(value: unknown): value is ScenarioResourceKind {
    return ['wood', 'stone', 'herbs', 'fiber', 'scrap', 'grain'].some(
        (kind) => kind === value
    )
}
