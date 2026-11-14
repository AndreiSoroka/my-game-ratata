import type {
    AutomationCommand,
    MarkerDefinition,
    ScenarioDefinition,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { parseScenario } from './scenarioCommands'

export interface ScenarioLibrary {
    markers: MarkerDefinition[]
    scenarios: ScenarioDefinition[]
    nextMarker: number
}
export function createScenarioLibrary(): ScenarioLibrary {
    return { markers: [], scenarios: [], nextMarker: 1 }
}
export function editScenarioLibrary(
    actor: GameCharacter,
    library: ScenarioLibrary,
    command: AutomationCommand
): string | null {
    switch (command.type) {
        case 'marker_create': {
            if (library.markers.length >= 64) {
                return 'Можно сохранить не больше 64 меток.'
            }
            const number = library.nextMarker++
            library.markers.push({
                id: `marker-${String(number)}`,
                number,
                name: command.name ?? `Метка ${String(number)}`,
                locationId: actor.locationId,
                position: { ...actor.position },
            })
            return null
        }
        case 'marker_rename': {
            const marker = library.markers.find(
                (entry) => entry.id === command.markerId
            )
            if (marker === undefined) {
                return 'Метка не найдена.'
            }
            marker.name = command.name
            return null
        }
        case 'marker_delete':
            library.markers = library.markers.filter(
                (entry) => entry.id !== command.markerId
            )
            return null
        case 'scenario_save':
            return saveScenario(library, command.scenario)
        case 'scenario_delete':
            library.scenarios = library.scenarios.filter(
                (entry) => entry.id !== command.scenarioId
            )
            return null
        default:
            return 'Неизвестная команда библиотеки.'
    }
}
function saveScenario(
    library: ScenarioLibrary,
    input: ScenarioDefinition
): string | null {
    const scenario = parseScenario(input)
    if (scenario === undefined) {
        return 'Некорректный сценарий.'
    }
    const index = library.scenarios.findIndex(
        (entry) => entry.id === scenario.id
    )
    if (index < 0 && library.scenarios.length >= 16) {
        return 'Можно сохранить не больше 16 сценариев.'
    }
    if (index < 0) {
        library.scenarios.push(scenario)
    } else {
        library.scenarios[index] = scenario
    }
    return null
}
export function resolveScenarioMarkers(
    definition: ScenarioDefinition,
    library: ScenarioLibrary
): ScenarioDefinition | undefined {
    const copy = structuredClone(definition)
    for (const step of copy.steps) {
        if (step.kind !== 'go' || step.destination.kind !== 'marker') {
            continue
        }
        const id = step.destination.markerId
        const marker = library.markers.find((entry) => entry.id === id)
        if (marker === undefined) {
            return undefined
        }
        step.destination = {
            kind: 'point',
            locationId: marker.locationId,
            position: { ...marker.position },
        }
    }
    return copy
}
