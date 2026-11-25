import {
    type MarkerDefinition,
    type ScenarioAbilityId,
    scenarioAbilityTargets,
    type ScenarioDefinition,
    type ScenarioSearchKind,
    type ScenarioStep,
} from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

import type { ScenarioFarmPlot } from './scenarioDestination'

export const scenarioStepLabels: Record<ScenarioStep['kind'], string> = {
    get go() {
        return tGame('game.automation.move')
    },
    get search() {
        return tGame('game.automation.lookAround')
    },
    get gather() {
        return tGame('game.automation.gather')
    },
    get attack() {
        return tGame('game.automation.attackEnemy')
    },
    get follow() {
        return tGame('game.automation.follow')
    },
    get farm() {
        return tGame('game.automation.farm')
    },
    get cast() {
        return tGame('game.automation.castAbility')
    },
    get pickup() {
        return tGame('game.automation.pickUpItems')
    },
    get deposit() {
        return tGame('game.automation.depositInChest')
    },
    get wait() {
        return tGame('game.automation.wait')
    },
    get recover() {
        return tGame('game.automation.recoverScenarioEditor')
    },
}
export const scenarioSearchLabels: Record<ScenarioSearchKind, string> = {
    get tree() {
        return tGame('game.automation.tree')
    },
    get stone() {
        return tGame('game.character.stone')
    },
    get herbs() {
        return tGame('game.character.herbs')
    },
    get fiber() {
        return tGame('game.character.fiber')
    },
    get scrap() {
        return tGame('game.automation.scrapMetal')
    },
    get grain() {
        return tGame('game.automation.grain')
    },
    get brushwood() {
        return tGame('game.character.brushwood')
    },
    get enemy() {
        return tGame('game.automation.enemy')
    },
    get chest() {
        return tGame('game.world.chest')
    },
    get item() {
        return tGame('game.automation.groundItem')
    },
}
let nextId = 0
/** Definitions contain only JSON data; this also unwraps nested Vue draft proxies. */
export function cloneScenario(scenario: ScenarioDefinition): ScenarioDefinition {
    return JSON.parse(JSON.stringify(scenario)) as ScenarioDefinition
}
export function sameScenario(
    first: ScenarioDefinition,
    second: ScenarioDefinition | undefined
): boolean {
    return (
        second !== undefined &&
        JSON.stringify(canonical(first)) === JSON.stringify(canonical(second))
    )
}
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical)
    if (value !== null && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, entry]) => [key, canonical(entry)])
        )
    return value
}
export function editorId(prefix: string): string {
    nextId += 1
    return `${prefix}-${Date.now().toString(36)}-${nextId.toString(36)}`
}
const simpleSteps = {
    search: { kind: 'search', target: 'tree' },
    gather: { kind: 'gather', resource: 'wood', amount: 1 },
    attack: { kind: 'attack' },
    follow: { kind: 'follow', target: 'nearest_friendly' },
    pickup: { kind: 'pickup' },
    wait: { kind: 'wait', durationMs: 1000 },
    recover: { kind: 'recover', resource: 'energy', atLeast: 80 },
} as const satisfies Record<
    Exclude<ScenarioStep['kind'], 'go' | 'cast' | 'farm' | 'deposit'>,
    Omit<ScenarioStep, 'id'> & Record<string, unknown>
>

export function newScenarioStep(
    kind: ScenarioStep['kind'],
    markers: readonly MarkerDefinition[],
    plots: readonly ScenarioFarmPlot[],
    abilities: readonly ScenarioAbilityId[]
): ScenarioStep | undefined {
    const id = editorId('step')
    if (kind === 'go') {
        const marker = markers[0]
        return {
            id,
            kind,
            destination: marker
                ? { kind: 'marker', markerId: marker.id }
                : { kind: 'visible', target: 'tree' },
        }
    }
    if (kind === 'farm') {
        const plot = plots[0]
        return plot
            ? { id, kind, action: 'sow', plotId: plot.id, locationId: plot.locationId }
            : undefined
    }
    if (kind === 'cast') {
        const abilityId = abilities[0]
        const target = abilityId && scenarioAbilityTargets(abilityId)[0]
        return abilityId && target ? { id, kind, abilityId, target } : undefined
    }
    if (kind === 'deposit') return { id, kind, mode: 'acquired', itemIds: [] }
    return { id, ...simpleSteps[kind] }
}
export function newScenario(): ScenarioDefinition {
    return {
        id: editorId('scenario'),
        name: tGame('game.automation.newScenario'),
        main: [],
        repeat: 1,
        sequences: [],
        reactions: [],
    }
}
export function copyScenario(scenario: ScenarioDefinition): ScenarioDefinition {
    const copy = cloneScenario(scenario)
    const stepIds = new Map<string, string>()
    const sequenceIds = new Map<string, string>()
    copy.id = editorId('scenario')
    copy.name = tGame('game.automation.copyScenarioName', { name: copy.name }).slice(0, 80)
    for (const sequence of copy.sequences) {
        const id = editorId('sequence')
        sequenceIds.set(sequence.id, id)
        sequence.id = id
    }
    for (const step of [...copy.main, ...copy.sequences.flatMap((sequence) => sequence.steps)]) {
        const id = editorId('step')
        stepIds.set(step.id, id)
        step.id = id
    }
    for (const reaction of copy.reactions) {
        reaction.id = editorId('reaction')
        reaction.sequenceId = sequenceIds.get(reaction.sequenceId) ?? reaction.sequenceId
        if (reaction.trigger.kind === 'step_result') {
            reaction.trigger.stepId =
                stepIds.get(reaction.trigger.stepId) ?? reaction.trigger.stepId
        }
    }
    return copy
}
export function moveScenarioEntry<T>(entries: readonly T[], index: number, direction: -1 | 1): T[] {
    const result = [...entries]
    const destination = index + direction
    const step = result[index]
    const other = result[destination]
    if (step && other) {
        result[destination] = step
        result[index] = other
    }
    return result
}
