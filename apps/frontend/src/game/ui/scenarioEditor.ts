import {
    type MarkerDefinition,
    type ScenarioDefinition,
    type ScenarioSearchKind,
    type ScenarioStep,
} from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

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
export function newScenarioStep(
    kind: ScenarioStep['kind'],
    markers: readonly MarkerDefinition[] = []
): ScenarioStep {
    const id = editorId('step')
    switch (kind) {
        case 'go':
            return {
                id,
                kind,
                destination: markers[0]
                    ? { kind: 'marker', markerId: markers[0].id }
                    : { kind: 'visible', target: 'tree' },
            }
        case 'search':
            return { id, kind, target: 'tree' }
        case 'gather':
            return { id, kind, resource: 'wood', amount: 1 }
        case 'attack':
            return { id, kind }
        case 'pickup':
            return { id, kind }
        case 'deposit':
            return { id, kind, mode: 'acquired', itemIds: [] }
        case 'wait':
            return { id, kind, durationMs: 1000 }
        case 'recover':
            return { id, kind, resource: 'energy', atLeast: 80 }
    }
}
export function newScenario(): ScenarioDefinition {
    return {
        id: editorId('scenario'),
        name: tGame('game.automation.newScenario'),
        steps: [],
        repeat: 1,
        threat: 'flee',
    }
}
export function moveScenarioStep(
    steps: readonly ScenarioStep[],
    index: number,
    direction: -1 | 1
): ScenarioStep[] {
    const result = [...steps]
    const destination = index + direction
    const step = result[index]
    const other = result[destination]
    if (step && other) {
        result[destination] = step
        result[index] = other
    }
    return result
}
