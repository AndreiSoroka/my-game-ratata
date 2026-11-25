import {
    type ScenarioTemplateId,
    type ScenarioTemplateParameters,
    scenarioTemplates,
} from './scenarioCatalog'
import { integer, object, onlyKeys, optionalId } from './scenarioParsingValues'
import { scenarioAbilityIds, scenarioAbilityTargets } from './scenarios'

export interface ConfigureScenarioDecision {
    type: 'configure_scenario'
    templateId: ScenarioTemplateId
    parameters: ScenarioTemplateParameters
    start: boolean
}
export function parseConfigureScenario(
    input: unknown
): ConfigureScenarioDecision | undefined {
    const record = object(input)
    if (
        record?.['type'] !== 'configure_scenario' ||
        !onlyKeys(record, ['type', 'templateId', 'parameters', 'start']) ||
        typeof record['start'] !== 'boolean'
    ) {
        return undefined
    }
    const template = scenarioTemplates.find(
        (entry) => entry.id === record['templateId']
    )
    const parameters = object(record['parameters'])
    if (
        template === undefined ||
        parameters === undefined ||
        !validTemplateParameters(template.id, parameters)
    ) {
        return undefined
    }
    return {
        type: 'configure_scenario',
        templateId: template.id,
        parameters,
        start: record['start'],
    }
}

const templateFields: Readonly<
    Record<ScenarioTemplateId, ReadonlyArray<keyof ScenarioTemplateParameters>>
> = {
    lumberjack: [
        'workMarkerId',
        'storageMarkerId',
        'shelterMarkerId',
        'amount',
        'distanceTiles',
        'dash',
    ],
    miner: [
        'workMarkerId',
        'storageMarkerId',
        'shelterMarkerId',
        'amount',
        'resource',
        'distanceTiles',
        'dash',
    ],
    farmer: ['workMarkerId', 'storageMarkerId', 'plotId', 'plotLocationId'],
    patrol: [
        'workMarkerId',
        'secondMarkerId',
        'shelterMarkerId',
        'distanceTiles',
        'dash',
    ],
    retreat: ['shelterMarkerId', 'distanceTiles', 'dash', 'abilityId'],
    follow: ['distanceTiles'],
}
function validTemplateParameters(
    templateId: ScenarioTemplateId,
    input: Record<string, unknown>
): input is ScenarioTemplateParameters & Record<string, unknown> {
    if (!onlyKeys(input, templateFields[templateId])) {
        return false
    }
    const {
        workMarkerId,
        storageMarkerId,
        shelterMarkerId,
        secondMarkerId,
        plotId,
        plotLocationId,
        amount,
        resource,
        distanceTiles,
        dash,
        abilityId,
    } = input
    return (
        [
            workMarkerId,
            storageMarkerId,
            shelterMarkerId,
            secondMarkerId,
            plotId,
            plotLocationId,
        ].every(optionalId) &&
        (amount === undefined || integer(amount, 1, 10_000)) &&
        (resource === undefined ||
            resource === 'stone' ||
            resource === 'scrap') &&
        validMovementOptions(distanceTiles, dash) &&
        (abilityId === undefined ||
            scenarioAbilityIds.some(
                (id) =>
                    abilityId === id &&
                    scenarioAbilityTargets(id).includes('self')
            ))
    )
}

function validMovementOptions(distance: unknown, dash: unknown): boolean {
    return (
        (distance === undefined || integer(distance, 1, 64)) &&
        (dash === undefined || typeof dash === 'boolean')
    )
}
