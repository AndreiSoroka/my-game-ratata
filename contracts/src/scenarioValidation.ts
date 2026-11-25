import {
    integer,
    object,
    onlyKeys,
    validId,
    validName,
} from './scenarioParsingValues'
import {
    type MarkerDefinition,
    SCENARIO_MAX_STEPS,
    type ScenarioDefinition,
    type ScenarioReaction,
    type ScenarioSequence,
    type ScenarioStep,
} from './scenarios'
import { parseScenarioStep } from './scenarioStepParsing'
import { parseScenarioTrigger } from './scenarioTriggerParsing'

type ValidationResult =
    { ok: true; scenario: ScenarioDefinition } | { ok: false; message: string }

export function validateScenarioDefinition(
    input: unknown,
    options: { markers?: ReadonlyArray<Pick<MarkerDefinition, 'id'>> } = {}
): ValidationResult {
    const record = object(input)
    if (
        record === undefined ||
        !onlyKeys(record, [
            'id',
            'name',
            'main',
            'repeat',
            'sequences',
            'reactions',
        ])
    ) {
        return invalid('Invalid scenario format.')
    }
    const metadata = parseMetadata(record)
    if (metadata === undefined) {
        return invalid('Check the scenario name and repeat count.')
    }

    const main = parseSteps(record['main'])
    const sequences = parseSequences(record['sequences'])
    const reactions = parseReactions(record['reactions'])
    if (main === undefined) {
        return invalid('Unknown or invalid action in the main route.')
    }
    if (sequences === undefined) {
        return invalid(
            'Unknown or invalid action in a sequence. Each sequence needs a unique name.'
        )
    }
    if (reactions === undefined) {
        return invalid('Unknown or invalid reaction.')
    }
    if (main.length === 0 && reactions.length === 0) {
        return invalid('Add an action or a reaction.')
    }

    if (!withinActionLimit(main, sequences)) {
        return invalid('Use up to 64 actions with distinct identifiers.')
    }

    return (
        validateReferences(main, sequences, reactions, options.markers) ?? {
            ok: true,
            scenario: {
                ...metadata,
                main,
                sequences,
                reactions,
            },
        }
    )
}

function withinActionLimit(
    main: ScenarioStep[],
    sequences: ScenarioSequence[]
): boolean {
    const steps = main.concat(sequences.flatMap((sequence) => sequence.steps))
    return steps.length <= SCENARIO_MAX_STEPS && uniqueIds(steps)
}

function parseMetadata(record: Record<string, unknown>) {
    const { id, name, repeat } = record
    return validId(id) &&
        validName(name) &&
        (repeat === null || integer(repeat, 1, 10_000))
        ? { id, name: name.trim(), repeat }
        : undefined
}

function invalid(message: string): Extract<ValidationResult, { ok: false }> {
    return { ok: false, message }
}

function parseSteps(input: unknown): ScenarioStep[] | undefined {
    if (!Array.isArray(input) || input.length > SCENARIO_MAX_STEPS) {
        return undefined
    }
    const steps: ScenarioStep[] = []
    for (const value of input) {
        const step = parseScenarioStep(value)
        if (step === undefined) {
            return undefined
        }
        steps.push(step)
    }
    return steps
}

function parseSequences(input: unknown): ScenarioSequence[] | undefined {
    if (!Array.isArray(input) || input.length > SCENARIO_MAX_STEPS) {
        return undefined
    }
    const sequences: ScenarioSequence[] = []
    for (const value of input) {
        const record = object(value)
        if (
            record === undefined ||
            !onlyKeys(record, ['id', 'name', 'steps'])
        ) {
            return undefined
        }
        const { id, name } = record
        const steps = parseSteps(record['steps'])
        if (
            !validId(id) ||
            !validName(name) ||
            steps === undefined ||
            steps.length === 0
        ) {
            return undefined
        }
        const label = name.trim()
        if (
            sequences.some(
                (sequence) => sequence.id === id || sequence.name === label
            )
        ) {
            return undefined
        }
        sequences.push({ id, name: label, steps })
    }
    return sequences
}

function parseReactions(input: unknown): ScenarioReaction[] | undefined {
    if (!Array.isArray(input) || input.length > SCENARIO_MAX_STEPS) {
        return undefined
    }
    const reactions: ScenarioReaction[] = []
    for (const value of input) {
        const reaction = parseReaction(value)
        if (reaction === undefined) {
            return undefined
        }
        reactions.push(reaction)
    }
    return uniqueIds(reactions) ? reactions : undefined
}

function parseReaction(value: unknown): ScenarioReaction | undefined {
    const record = object(value)
    if (
        record === undefined ||
        !onlyKeys(record, [
            'id',
            'trigger',
            'sequenceId',
            'delayMs',
            'notification',
        ])
    ) {
        return undefined
    }
    const { id, sequenceId, delayMs, notification } = record
    const trigger = parseScenarioTrigger(record['trigger'])
    if (
        !validId(id) ||
        !validId(sequenceId) ||
        trigger === undefined ||
        (delayMs !== undefined && !integer(delayMs, 0, 3_600_000)) ||
        !validNotification(notification)
    ) {
        return undefined
    }
    return {
        id,
        sequenceId,
        trigger,
        ...(delayMs === undefined ? {} : { delayMs }),
        ...(notification === undefined
            ? {}
            : { notification: notification.trim() }),
    }
}
function validNotification(value: unknown): value is string | undefined {
    return (
        value === undefined ||
        (typeof value === 'string' &&
            value.trim().length > 0 &&
            value.length <= 160)
    )
}

function uniqueIds(values: ReadonlyArray<{ id: string }>): boolean {
    return new Set(values.map((value) => value.id)).size === values.length
}

function validateReferences(
    main: ScenarioStep[],
    sequences: ScenarioSequence[],
    reactions: ScenarioReaction[],
    markers: ReadonlyArray<Pick<MarkerDefinition, 'id'>> | undefined
): Extract<ValidationResult, { ok: false }> | undefined {
    if (main.some(usesReactionTarget)) {
        return invalid('Only a reaction sequence can use the event target.')
    }
    if (markers !== undefined) {
        const missing = main
            .concat(sequences.flatMap((sequence) => sequence.steps))
            .find((step) => {
                if (step.kind !== 'go' || step.destination.kind !== 'marker') {
                    return false
                }
                const { markerId } = step.destination
                return !markers.some(({ id }) => id === markerId)
            })
        if (missing !== undefined) {
            return invalid(
                'Choose an existing personal marker for every movement action.'
            )
        }
    }
    for (const { sequenceId, trigger } of reactions) {
        const sequence = sequences.find(
            (sequence) => sequence.id === sequenceId
        )
        if (sequence === undefined) {
            return invalid(
                'Choose an existing action sequence for each reaction.'
            )
        }
        if (
            trigger.kind === 'step_result' &&
            !main.some((step) => step.id === trigger.stepId)
        ) {
            return invalid(
                'A step-result reaction must select a step in the main route.'
            )
        }
        if (
            sequence.steps.some(
                (step) =>
                    usesReactionTarget(step) &&
                    (step.kind === 'follow'
                        ? trigger.kind !== 'friendly_nearby'
                        : trigger.kind !== 'enemy_visible')
            )
        ) {
            return invalid(
                'This reaction does not supply the target required by its sequence.'
            )
        }
    }
    return undefined
}

function usesReactionTarget(step: ScenarioStep): boolean {
    return (
        (step.kind === 'attack' ||
            step.kind === 'follow' ||
            step.kind === 'cast') &&
        step.target === 'reaction_target'
    )
}
