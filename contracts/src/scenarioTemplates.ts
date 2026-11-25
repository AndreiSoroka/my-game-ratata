import type { ItemId } from './inventory'
import {
    type ScenarioTemplateId,
    type ScenarioTemplateParameters,
} from './scenarioCatalog'
import { type ScenarioDefinition, type ScenarioStep } from './scenarios'
export * from './scenarioCatalog'
export * from './scenarioTemplateParameters'
export function buildScenarioFromTemplate(
    templateId: ScenarioTemplateId,
    id: string,
    name: string,
    parameters: ScenarioTemplateParameters = {}
): ScenarioDefinition {
    const scenario: ScenarioDefinition = {
        id,
        name,
        repeat: null,
        main: [],
        sequences: [],
        reactions: [],
    }
    templateBuilders[templateId](scenario, parameters)
    if (templateId !== 'retreat' && parameters.shelterMarkerId !== undefined) {
        addRetreat(scenario, parameters)
    }
    return scenario
}

type TemplateBuilder = (
    scenario: ScenarioDefinition,
    parameters: ScenarioTemplateParameters
) => void
const templateBuilders: Record<ScenarioTemplateId, TemplateBuilder> = {
    lumberjack: (scenario, parameters) =>
        addGathering(scenario, parameters, 'wood'),
    miner: (scenario, parameters) =>
        addGathering(scenario, parameters, parameters.resource ?? 'stone'),
    farmer: addFarm,
    patrol: addPatrol,
    retreat: addRetreat,
    follow: addFollow,
}

function addGathering(
    scenario: ScenarioDefinition,
    {
        workMarkerId = '',
        storageMarkerId = '',
        amount = 3,
    }: ScenarioTemplateParameters,
    material: 'wood' | 'stone' | 'scrap'
): void {
    scenario.main.push(
        go('work', workMarkerId),
        { id: 'gather', kind: 'gather', resource: material, amount },
        go('storage', storageMarkerId),
        deposit('unload', material)
    )
    scenario.sequences.push({
        id: 'unload-bag',
        name: 'Разгрузка / Unload',
        steps: [
            go('early-storage', storageMarkerId),
            deposit('early-unload', material, 'all'),
        ],
    })
    scenario.reactions.push({
        id: 'bag-full',
        trigger: { kind: 'inventory_full' },
        sequenceId: 'unload-bag',
    })
}

function addFarm(
    scenario: ScenarioDefinition,
    {
        workMarkerId = '',
        storageMarkerId = '',
        plotId = '',
        plotLocationId: locationId = '',
    }: ScenarioTemplateParameters
): void {
    const plot = { plotId, locationId }
    scenario.main.push(go('field', workMarkerId), {
        id: 'sow',
        kind: 'farm',
        action: 'sow',
        ...plot,
    })
    scenario.sequences.push({
        id: 'harvest',
        name: 'Жатва / Harvest',
        steps: [
            { id: 'harvest-plot', kind: 'farm', action: 'harvest', ...plot },
            go('grain-storage', storageMarkerId),
            deposit('unload-grain', 'grain'),
        ],
    })
    scenario.reactions.push({
        id: 'ripe',
        trigger: { kind: 'plot_ripe', ...plot },
        sequenceId: 'harvest',
    })
}

function addPatrol(
    scenario: ScenarioDefinition,
    {
        workMarkerId = '',
        secondMarkerId = '',
        dash = false,
    }: ScenarioTemplateParameters
): void {
    scenario.main.push(
        go('first', workMarkerId, dash),
        wait('first-pause'),
        go('second', secondMarkerId, dash),
        wait('second-pause')
    )
}

function addFollow(
    scenario: ScenarioDefinition,
    { distanceTiles = 5 }: ScenarioTemplateParameters
): void {
    scenario.sequences.push({
        id: 'follow',
        name: 'Следовать / Follow',
        steps: [
            { id: 'follow-friend', kind: 'follow', target: 'reaction_target' },
        ],
    })
    scenario.reactions.push({
        id: 'friend',
        trigger: {
            kind: 'friendly_nearby',
            distanceTiles,
            onlyWhenNotFollowing: true,
        },
        sequenceId: 'follow',
    })
}

function addRetreat(
    scenario: ScenarioDefinition,
    {
        shelterMarkerId = '',
        distanceTiles = 5,
        dash = false,
        abilityId,
    }: ScenarioTemplateParameters
): void {
    const steps: ScenarioStep[] = []
    if (abilityId !== undefined) {
        steps.push({
            id: 'cast-cover',
            kind: 'cast',
            abilityId,
            target: 'self',
        })
    }
    steps.push(go('shelter', shelterMarkerId, dash))
    scenario.sequences.push({
        id: 'retreat',
        name: 'Отступление / Retreat',
        steps,
    })
    scenario.reactions.unshift({
        id: 'enemy',
        trigger: { kind: 'enemy_visible', distanceTiles },
        sequenceId: 'retreat',
    })
}

function go(id: string, markerId: string, dash = false): ScenarioStep {
    return {
        id,
        kind: 'go',
        destination: { kind: 'marker', markerId },
        ...(dash ? { dash } : {}),
    }
}
function wait(id: string): ScenarioStep {
    return { id, kind: 'wait', durationMs: 2_000 }
}
function deposit(
    id: string,
    item: ItemId,
    mode: 'acquired' | 'all' = 'acquired'
): ScenarioStep {
    return { id, kind: 'deposit', mode, itemIds: [item] }
}
