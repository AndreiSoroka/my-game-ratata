import type {
    AutomationCommand,
    ScenarioDefinition,
} from '@my-game-ratata/contracts'

import {
    integer,
    object,
    onlyKeys,
    optionalId,
    validId,
    validName,
} from './scenarioParsingValues'
import { parseScenarioStep } from './scenarioStepParsing'

const commandTypes = [
    'marker_create',
    'marker_rename',
    'marker_delete',
    'scenario_save',
    'scenario_delete',
    'scenario_start',
    'scenario_pause',
    'scenario_resume',
    'scenario_stop',
    'release_input',
] as const
export function isAutomationCommand(type: unknown): boolean {
    return commandTypes.some((candidate) => candidate === type)
}

export function isAutomationDecision(value: {
    type: unknown
}): value is AutomationCommand {
    return isAutomationCommand(value.type)
}

export function parseAutomationCommand(
    record: Record<string, unknown>
): AutomationCommand | undefined {
    switch (record['type']) {
        case 'release_input':
            return onlyKeys(record, ['type'])
                ? { type: 'release_input' }
                : undefined
        case 'marker_create':
            return parseCreateMarker(record)
        case 'marker_rename':
            return parseRenameMarker(record)
        case 'marker_delete':
            return parseDeleteMarker(record)
        case 'scenario_save':
            return parseSaveScenario(record)
        case 'scenario_delete':
            return parseDeleteScenario(record)
        case 'scenario_start':
            return parseStartScenario(record)
        case 'scenario_pause':
        case 'scenario_resume':
        case 'scenario_stop':
            return parseScenarioControl(record, record['type'])
        default:
            return undefined
    }
}

export function parseScenario(value: unknown): ScenarioDefinition | undefined {
    const record = object(value)
    if (
        record === undefined ||
        !onlyKeys(record, ['id', 'name', 'steps', 'repeat', 'threat'])
    ) {
        return undefined
    }
    const metadata = parseMetadata(record)
    if (metadata === undefined) {
        return undefined
    }
    if (
        !Array.isArray(record['steps']) ||
        record['steps'].length < 1 ||
        record['steps'].length > 64
    ) {
        return undefined
    }
    const steps: ScenarioDefinition['steps'] = []
    for (const input of record['steps']) {
        const step = parseScenarioStep(input)
        if (
            step === undefined ||
            steps.some((previous) => previous.id === step.id)
        ) {
            return undefined
        }
        steps.push(step)
    }
    return { ...metadata, steps }
}

function parseMetadata(
    record: Record<string, unknown>
): Omit<ScenarioDefinition, 'steps'> | undefined {
    if (!validId(record['id']) || !validName(record['name'])) {
        return undefined
    }
    const repeat = record['repeat']
    if (repeat !== null && !integer(repeat, 1, 10_000)) {
        return undefined
    }
    const threat = record['threat']
    if (threat !== 'continue' && threat !== 'attack' && threat !== 'flee') {
        return undefined
    }
    return { id: record['id'], name: record['name'].trim(), repeat, threat }
}

function parseCreateMarker(
    record: Record<string, unknown>
): AutomationCommand | undefined {
    if (!onlyKeys(record, ['type', 'name'])) {
        return undefined
    }
    const name = record['name']
    if (name === undefined) {
        return { type: 'marker_create' }
    }
    return validName(name)
        ? { type: 'marker_create', name: name.trim() }
        : undefined
}
function parseRenameMarker(
    record: Record<string, unknown>
): AutomationCommand | undefined {
    if (
        !onlyKeys(record, ['type', 'markerId', 'name']) ||
        !validId(record['markerId']) ||
        !validName(record['name'])
    ) {
        return undefined
    }
    return {
        type: 'marker_rename',
        markerId: record['markerId'],
        name: record['name'].trim(),
    }
}
function parseDeleteMarker(
    record: Record<string, unknown>
): AutomationCommand | undefined {
    return onlyKeys(record, ['type', 'markerId']) && validId(record['markerId'])
        ? { type: 'marker_delete', markerId: record['markerId'] }
        : undefined
}
function parseSaveScenario(
    record: Record<string, unknown>
): AutomationCommand | undefined {
    if (!onlyKeys(record, ['type', 'scenario'])) {
        return undefined
    }
    const scenario = parseScenario(record['scenario'])
    return scenario === undefined
        ? undefined
        : { type: 'scenario_save', scenario }
}
function parseDeleteScenario(
    record: Record<string, unknown>
): AutomationCommand | undefined {
    return onlyKeys(record, ['type', 'scenarioId']) &&
        validId(record['scenarioId'])
        ? { type: 'scenario_delete', scenarioId: record['scenarioId'] }
        : undefined
}
function parseStartScenario(
    record: Record<string, unknown>
): AutomationCommand | undefined {
    if (
        !onlyKeys(record, ['type', 'scenarioId', 'targetId']) ||
        !validId(record['scenarioId']) ||
        !optionalId(record['targetId'])
    ) {
        return undefined
    }
    return {
        type: 'scenario_start',
        scenarioId: record['scenarioId'],
        ...(record['targetId'] === undefined
            ? {}
            : { targetId: record['targetId'] }),
    }
}
function parseScenarioControl(
    record: Record<string, unknown>,
    type: 'scenario_pause' | 'scenario_resume' | 'scenario_stop'
): AutomationCommand | undefined {
    return onlyKeys(record, ['type', 'targetId']) &&
        optionalId(record['targetId'])
        ? {
              type,
              ...(record['targetId'] === undefined
                  ? {}
                  : { targetId: record['targetId'] }),
          }
        : undefined
}

export { validId } from './scenarioParsingValues'
