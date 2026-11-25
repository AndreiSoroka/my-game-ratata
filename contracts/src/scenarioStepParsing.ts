import { ITEM_DEFINITIONS } from './inventory'
import { parseScenarioDestination } from './scenarioDestinationParsing'
import {
    integer,
    itemId,
    object,
    onlyKeys,
    optionalId,
    optionalItem,
    optionalPinnedLocationId,
    searchKind,
    validFarmPlot,
    validId,
} from './scenarioParsingValues'
import {
    scenarioAbilityIds,
    scenarioAbilityTargets,
    type ScenarioResourceKind,
    type ScenarioStep,
} from './scenarios'

type StepParser = (
    record: Record<string, unknown>,
    id: string
) => ScenarioStep | undefined
const stepParsers = new Map<string, StepParser>([
    ['go', parseGo],
    ['search', parseSearch],
    ['gather', parseGather],
    ['attack', parseAttack],
    ['follow', parseFollow],
    ['cast', parseCast],
    ['farm', parseFarm],
    ['pickup', parsePickup],
    ['deposit', parseDeposit],
    ['wait', parseWait],
    ['recover', parseRecover],
])
export function parseScenarioStep(value: unknown): ScenarioStep | undefined {
    const record = object(value)
    if (
        record === undefined ||
        !validId(record['id']) ||
        typeof record['kind'] !== 'string'
    ) {
        return undefined
    }
    return stepParsers.get(record['kind'])?.(record, record['id'])
}
function parseAttack(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    const { target } = record
    if (!onlyKeys(record, ['id', 'kind', 'target'])) {
        return undefined
    }
    if (target === undefined) {
        return { id, kind: 'attack' }
    }
    return target === 'visible_enemy' || target === 'reaction_target'
        ? { id, kind: 'attack', target }
        : undefined
}
function parseFollow(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    const { target } = record
    return onlyKeys(record, ['id', 'kind', 'target']) &&
        (target === 'nearest_friendly' || target === 'reaction_target')
        ? { id, kind: 'follow', target }
        : undefined
}
function parseFarm(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    const { action, plotId, locationId } = record
    return onlyKeys(record, ['id', 'kind', 'action', 'plotId', 'locationId']) &&
        (action === 'sow' || action === 'harvest') &&
        typeof plotId === 'string' &&
        typeof locationId === 'string' &&
        validFarmPlot(plotId, locationId)
        ? { id, kind: 'farm', action, plotId, locationId }
        : undefined
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
function parseCast(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    const abilityId = scenarioAbilityIds.find(
        (candidate) => candidate === record['abilityId']
    )
    if (
        abilityId === undefined ||
        !onlyKeys(record, ['id', 'kind', 'abilityId', 'target'])
    ) {
        return undefined
    }
    const target = scenarioAbilityTargets(abilityId).find(
        (candidate) => candidate === record['target']
    )
    return target === undefined
        ? undefined
        : { id, kind: 'cast', abilityId, target }
}
function parseGo(
    record: Record<string, unknown>,
    id: string
): ScenarioStep | undefined {
    const dash = record['dash']
    if (
        !onlyKeys(record, ['id', 'kind', 'destination', 'dash']) ||
        (dash !== undefined && typeof dash !== 'boolean')
    ) {
        return undefined
    }
    const destination = parseScenarioDestination(record['destination'])
    return destination === undefined
        ? undefined
        : {
              id,
              kind: 'go',
              destination,
              ...(dash === undefined ? {} : { dash }),
          }
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
        !onlyKeys(record, [
            'id',
            'kind',
            'chestId',
            'mode',
            'itemIds',
            'locationId',
        ]) ||
        !optionalId(record['chestId']) ||
        !optionalPinnedLocationId(record['locationId'], record['chestId'])
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
        ...(record['locationId'] === undefined
            ? {}
            : { locationId: record['locationId'] }),
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
    return [
        'wood',
        'stone',
        'herbs',
        'fiber',
        'scrap',
        'grain',
        'brushwood',
    ].some((kind) => kind === value)
}
