import type {
    ScenarioDefinition,
    ScenarioSequence,
    ScenarioStep,
} from './scenarios'
import { Line } from './scenarioTextLine'
import {
    parseAction,
    parseReaction,
    type PendingReaction,
    type TextMarkers,
} from './scenarioTextSyntax'
import { validateScenarioDefinition } from './scenarioValidation'
export { formatScenarioText } from './scenarioTextFormat'

type TextResult =
    | { ok: true; scenario: ScenarioDefinition }
    | { ok: false; line: number; message: string }

interface TextOptions {
    id: string
    name: string
    markers?: TextMarkers
    previous?: ScenarioDefinition
}
interface TextBlock {
    steps: ScenarioStep[]
    previous: ScenarioStep[] | undefined
    prefix: string
}

export function parseScenarioText(
    source: string,
    options: TextOptions
): TextResult {
    if (source.length > 40_000) {
        return { ok: false, line: 1, message: 'Scenario text is too long.' }
    }
    const reader = new ScenarioTextReader(options)
    const lines = source.split(/\r?\n/)
    for (const [index, sourceLine] of lines.entries()) {
        try {
            reader.read(new Line(sourceLine), index + 1)
        } catch (error) {
            return {
                ok: false,
                line: index + 1,
                message:
                    error instanceof Error ? error.message : 'Invalid command.',
            }
        }
    }
    return reader.finish(lines.length)
}

class ScenarioTextReader {
    private readonly scenario: ScenarioDefinition
    private readonly stepIds: Set<string>
    private readonly sequenceIds: Set<string>
    private readonly reactionIds: Set<string>
    private readonly reactions: PendingReaction[] = []
    private open: TextBlock | undefined
    private mainSeen = false
    private repeatSeen = false

    constructor(private readonly options: TextOptions) {
        const { id, name, previous } = options
        this.scenario = {
            id,
            name,
            main: [],
            repeat: 1,
            sequences: [],
            reactions: [],
        }
        this.stepIds = new Set(
            previous?.main
                .concat(
                    previous.sequences.flatMap((sequence) => sequence.steps)
                )
                .map((step) => step.id)
        )
        this.sequenceIds = new Set(
            previous?.sequences.map((sequence) => sequence.id)
        )
        this.reactionIds = new Set(
            previous?.reactions.map((reaction) => reaction.id)
        )
    }

    public read(line: Line, lineNumber: number): void {
        if (line.peek() === undefined) {
            return
        }
        if (this.open === undefined) {
            this.readHeader(line, lineNumber)
        } else if (line.accept('}')) {
            this.open = undefined
        } else {
            const { steps, previous, prefix } = this.open
            const index = steps.length
            const id =
                previous?.[index]?.id ?? freeId(prefix, index, this.stepIds)
            steps.push(parseAction(line, id, this.options.markers))
        }
        line.end()
    }

    private readHeader(line: Line, lineNumber: number): void {
        switch (line.take()) {
            case 'main':
                this.startMain(line)
                break
            case 'sequence':
                this.startSequence(line)
                break
            case 'repeat':
                this.readRepeat(line)
                break
            case 'on': {
                const index = this.reactions.length
                const id =
                    this.options.previous?.reactions[index]?.id ??
                    freeId('reaction', index, this.reactionIds)
                this.reactions.push(
                    parseReaction(line, this.scenario.main, id, lineNumber)
                )
                break
            }
            default:
                throw new Error('Expected repeat, main, sequence or on.')
        }
    }

    private startMain(line: Line): void {
        if (this.mainSeen) {
            throw new Error('Declare a single main block.')
        }
        this.mainSeen = true
        line.expect('{')
        this.open = {
            steps: this.scenario.main,
            previous: this.options.previous?.main,
            prefix: 'main',
        }
    }

    private startSequence(line: Line): void {
        const name = line.string()
        line.expect('{')
        const prior = this.options.previous?.sequences.find(
            (sequence) => sequence.name === name
        )
        const id =
            prior?.id ??
            freeId(
                'sequence-text',
                this.scenario.sequences.length,
                this.sequenceIds
            )
        const sequence: ScenarioSequence = { id, name, steps: [] }
        this.scenario.sequences.push(sequence)
        this.open = {
            steps: sequence.steps,
            previous: prior?.steps,
            prefix: id,
        }
    }

    private readRepeat(line: Line): void {
        if (this.repeatSeen) {
            throw new Error('Declare repeat once.')
        }
        this.repeatSeen = true
        this.scenario.repeat = line.accept('forever')
            ? null
            : line.accept('once')
              ? 1
              : line.number()
    }

    public finish(line: number): TextResult {
        if (this.open !== undefined) {
            return {
                ok: false,
                line,
                message: 'Close the action block with }.',
            }
        }
        for (const entry of this.reactions) {
            const sequenceId = this.scenario.sequences.find(
                ({ name }) => name === entry.sequenceName
            )?.id
            if (sequenceId === undefined) {
                return {
                    ok: false,
                    line: entry.line,
                    message: 'Unknown action sequence.',
                }
            }
            this.scenario.reactions.push({ ...entry.rule, sequenceId })
        }
        const { markers } = this.options
        const result = validateScenarioDefinition(
            this.scenario,
            markers === undefined ? {} : { markers }
        )
        return result.ok ? result : { ...result, line: 1 }
    }
}

function freeId(prefix: string, start: number, taken: Set<string>): string {
    let number = start + 1
    while (taken.has(`${prefix}-${String(number)}`)) {
        number += 1
    }
    const id = `${prefix}-${String(number)}`
    taken.add(id)
    return id
}
