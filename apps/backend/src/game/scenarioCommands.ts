import {
    type AutomationCommand,
    parseAutomationCommand,
    validateScenarioDefinition,
} from '@my-game-ratata/contracts'

export {
    isAutomationCommand,
    isAutomationDecision,
    parseAutomationCommand,
    parseScenario,
    validScenarioId as validId,
} from '@my-game-ratata/contracts'

export function parseAutomationBoundary(record: Record<string, unknown>): {
    error?: string
    message?: AutomationCommand
} {
    const message = parseAutomationCommand(record)
    if (message === undefined && record['type'] === 'scenario_save') {
        const validation = validateScenarioDefinition(record['scenario'])
        if (!validation.ok) {
            return { error: validation.message }
        }
    }
    return message === undefined
        ? { error: 'Invalid automation command' }
        : { message }
}
