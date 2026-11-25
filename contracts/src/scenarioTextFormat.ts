import type {
    ScenarioDefinition,
    ScenarioDestination,
    ScenarioStep,
    ScenarioTrigger,
} from './scenarios'
import type { TextMarkers } from './scenarioTextSyntax'

const quote = JSON.stringify
export function formatScenarioText(
    scenario: ScenarioDefinition,
    markers?: TextMarkers
): string {
    const { main, repeat, sequences, reactions } = scenario
    const lines = [
        `repeat ${repeat === null ? 'forever' : repeat === 1 ? 'once' : String(repeat)}`,
    ]
    lines.push('', ...formatBlock('main', main, markers))
    for (const sequence of sequences) {
        lines.push(
            '',
            ...formatBlock(
                `sequence ${quote(sequence.name)}`,
                sequence.steps,
                markers
            )
        )
    }
    const labels = new Map(
        sequences.map((sequence) => [sequence.id, sequence.name])
    )
    if (reactions.length > 0) {
        lines.push('')
    }
    for (const rule of reactions) {
        const delay =
            rule.delayMs === undefined || rule.delayMs === 0
                ? ''
                : ` after ${formatDuration(rule.delayMs)}`
        const notification =
            rule.notification === undefined
                ? ''
                : ` notify ${quote(rule.notification)}`
        lines.push(
            `on ${formatTrigger(rule.trigger, main)}${delay} -> ${quote(labels.get(rule.sequenceId) ?? '')}${notification}`
        )
    }
    return lines.join('\n')
}

function formatBlock(
    header: string,
    steps: ScenarioStep[],
    markers: TextMarkers | undefined
): string[] {
    return [
        `${header} {`,
        ...steps.map((step) => `  ${formatAction(step, markers)}`),
        '}',
    ]
}

function formatAction(
    step: ScenarioStep,
    markers: TextMarkers | undefined
): string {
    if (step.kind === 'go') {
        return `go ${formatDestination(step.destination, markers)}${step.dash === true ? ' dash' : ''}`
    }
    if (step.kind === 'farm') {
        return `${step.action} ${formatPlot(step)}`
    }
    return formatSimpleAction(step)
}

function formatSimpleAction(
    step: Exclude<ScenarioStep, { kind: 'go' | 'farm' }>
): string {
    switch (step.kind) {
        case 'search':
            return [
                'search',
                step.target,
                ...(step.itemId === undefined ? [] : ['item', step.itemId]),
            ].join(' ')
        case 'gather':
            return `gather ${step.resource} ${String(step.amount)}`
        case 'attack':
            return ['attack', ...maybePair(step.target)].join(' ')
        case 'follow':
            return `follow ${step.target}`
        case 'cast':
            return `cast ${step.abilityId} ${step.target}`
        case 'pickup':
            return ['pickup', ...maybePair(step.itemId)].join(' ')
        case 'deposit':
            return formatDeposit(step)
        case 'wait':
            return `wait ${formatDuration(step.durationMs)}`
        case 'recover':
            return `recover ${step.resource} ${String(step.atLeast)}`
    }
}
function formatDeposit(
    step: Extract<ScenarioStep, { kind: 'deposit' }>
): string {
    const items = step.itemIds.length === 0 ? '' : ` ${step.itemIds.join(', ')}`
    return `deposit ${step.mode}${items}${option('chest', step.chestId)}${option('at', step.locationId)}`
}

function maybePair(first: string | undefined, ...rest: string[]): string[] {
    return first === undefined ? [] : [first, ...rest]
}

function formatDestination(
    destination: ScenarioDestination,
    markers: TextMarkers | undefined
): string {
    switch (destination.kind) {
        case 'marker': {
            const number =
                markers?.find((marker) => marker.id === destination.markerId)
                    ?.number ?? /^marker-(\d+)$/.exec(destination.markerId)?.[1]
            return `marker(${String(number ?? quote(destination.markerId))})`
        }
        case 'point':
            return `point(${quote(destination.locationId)}, ${String(destination.position.x)}, ${String(destination.position.y)})`
        case 'visible':
            return `visible(${destination.target}${option('target', destination.targetId)}${option('at', destination.locationId)}${destination.itemId === undefined ? '' : ` item ${destination.itemId}`})`
    }
}

function formatTrigger(trigger: ScenarioTrigger, main: ScenarioStep[]): string {
    switch (trigger.kind) {
        case 'enemy_visible':
            return `enemy_visible(${String(trigger.distanceTiles)} tiles)`
        case 'friendly_nearby':
            return `friendly_nearby(${String(trigger.distanceTiles)} tiles)${trigger.onlyWhenNotFollowing === true ? ' while not_following' : ''}`
        case 'inventory_full':
            return 'inventory_full'
        case 'plot_ripe':
            return `plot_ripe(${formatPlot(trigger)})`
        case 'step_result':
            return `step_result(${String(main.findIndex((step) => step.id === trigger.stepId) + 1)}, ${trigger.status})`
    }
}

function option(name: string, value: string | undefined): string {
    return value === undefined ? '' : ` ${name} ${quote(value)}`
}
function formatPlot(plot: { plotId: string; locationId: string }): string {
    return `plot(${quote(plot.plotId)}, ${quote(plot.locationId)})`
}
function formatDuration(durationMs: number): string {
    return durationMs % 1000 === 0
        ? `${String(durationMs / 1000)}s`
        : `${String(durationMs)}ms`
}
