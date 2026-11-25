import type {
    MarkerDefinition,
    ScenarioReaction,
    ScenarioStep,
} from './scenarios'
import { parseScenarioStep } from './scenarioStepParsing'
import { type Line } from './scenarioTextLine'
import { parseScenarioTrigger } from './scenarioTriggerParsing'

export type TextMarkers = ReadonlyArray<Pick<MarkerDefinition, 'id' | 'number'>>
export interface PendingReaction {
    line: number
    sequenceName: string
    rule: Omit<ScenarioReaction, 'sequenceId'>
}

export function parseAction(
    line: Line,
    id: string,
    markers: TextMarkers | undefined
): ScenarioStep {
    const kind = line.take()
    const value = parseArguments(kind, line, markers)
    const step = parseScenarioStep({
        id,
        kind: kind === 'sow' || kind === 'harvest' ? 'farm' : kind,
        ...value,
    })
    if (step === undefined) {
        throw new Error(`Invalid arguments for "${kind}".`)
    }
    return step
}

function parseArguments(
    kind: string,
    line: Line,
    markers: TextMarkers | undefined
): Record<string, unknown> {
    switch (kind) {
        case 'go':
            return {
                destination: parseDestination(line, markers),
                ...(line.accept('dash') ? { dash: true } : {}),
            }
        case 'sow':
        case 'harvest':
            return { ...parsePlot(line), action: kind }
        case 'deposit':
            return parseDeposit(line)
        case 'attack':
        case 'pickup': {
            const key = kind === 'attack' ? 'target' : 'itemId'
            return {
                [key]: line.peek() === undefined ? undefined : line.take(),
            }
        }
        default:
            return parseSimpleArguments(kind, line)
    }
}

function parseSimpleArguments(
    kind: string,
    line: Line
): Record<string, unknown> {
    switch (kind) {
        case 'search':
            return { target: line.take(), itemId: line.optionalWord('item') }
        case 'gather':
            return {
                resource: line.take(),
                amount: line.accept('depleted') ? 'depleted' : line.number(),
            }
        case 'follow':
            return { target: line.take() }
        case 'cast':
            return { abilityId: line.take(), target: line.take() }
        case 'wait':
            return { durationMs: line.duration() }
        case 'recover':
            return { resource: line.take(), atLeast: line.number() }
        default:
            throw new Error(`Unknown action "${kind}".`)
    }
}

function parseDeposit(line: Line): Record<string, unknown> {
    const mode = line.take()
    const itemIds: string[] = []
    if (line.peek() !== undefined && line.peek() !== 'chest') {
        do {
            itemIds.push(line.take())
        } while (line.accept(','))
    }
    return {
        mode,
        itemIds,
        chestId: line.optionalString('chest'),
        locationId: line.optionalString('at'),
    }
}

function parseDestination(
    line: Line,
    markers: TextMarkers | undefined
): Record<string, unknown> {
    const kind = line.take()
    line.expect('(')
    let result: Record<string, unknown>
    if (kind === 'marker') {
        const markerId =
            line.peek()?.startsWith('"') === true
                ? line.string()
                : markerByNumber(line.number(), markers)
        if (
            markers !== undefined &&
            !markers.some((marker) => marker.id === markerId)
        ) {
            throw new Error('Unknown marker.')
        }
        result = { markerId }
    } else if (kind === 'visible') {
        result = {
            target: line.take(),
            targetId: line.optionalString('target'),
            locationId: line.optionalString('at'),
            itemId: line.optionalWord('item'),
        }
    } else if (kind === 'point') {
        const locationId = line.string()
        line.expect(',')
        const x = line.number()
        line.expect(',')
        result = { locationId, position: { x, y: line.number() } }
    } else {
        throw new Error('Expected marker, visible or point.')
    }
    line.expect(')')
    return { kind, ...result }
}

function markerByNumber(
    number: number,
    markers: TextMarkers | undefined
): string {
    const marker = markers?.find((marker) => marker.number === number)
    if (marker !== undefined) {
        return marker.id
    }
    if (markers !== undefined || !Number.isSafeInteger(number) || number < 1) {
        throw new Error('Unknown marker.')
    }
    return `marker-${String(number)}`
}

function parsePlot(line: Line): { plotId: string; locationId: string } {
    line.expect('plot')
    line.expect('(')
    const plotId = line.string()
    line.expect(',')
    const locationId = line.string()
    line.expect(')')
    return { plotId, locationId }
}

export function parseReaction(
    line: Line,
    main: ScenarioStep[],
    id: string,
    lineNumber: number
): PendingReaction {
    const kind = line.take()
    let parameters: Record<string, unknown> = {}
    if (kind === 'enemy_visible' || kind === 'friendly_nearby') {
        line.expect('(')
        const distanceTiles = line.number()
        line.expect('tiles')
        line.expect(')')
        parameters = { distanceTiles }
        if (kind === 'friendly_nearby' && line.accept('while')) {
            line.expect('not_following')
            parameters['onlyWhenNotFollowing'] = true
        }
    } else if (kind === 'plot_ripe') {
        line.expect('(')
        parameters = parsePlot(line)
        line.expect(')')
    } else if (kind === 'step_result') {
        line.expect('(')
        const index = line.number()
        line.expect(',')
        parameters = { stepId: main[index - 1]?.id, status: line.take() }
        line.expect(')')
    }
    const trigger = parseScenarioTrigger({ kind, ...parameters })
    if (trigger === undefined) {
        throw new Error(`Unknown or invalid event "${kind}".`)
    }
    const delayMs = line.accept('after') ? line.duration() : undefined
    line.expect('->')
    const sequenceName = line.string()
    const notification = line.optionalString('notify')
    return {
        line: lineNumber,
        sequenceName,
        rule: {
            id,
            trigger,
            ...(delayMs === undefined ? {} : { delayMs }),
            ...(notification === undefined ? {} : { notification }),
        },
    }
}
