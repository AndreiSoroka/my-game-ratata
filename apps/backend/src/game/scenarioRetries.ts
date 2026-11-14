import type { ScenarioOutcome } from './scenarioNavigation'
import type { ScenarioRuntime } from './scenarioState'

export function retryOutcome(run: ScenarioRuntime): ScenarioOutcome {
    return run.step.lastFailure === undefined
        ? { state: 'waiting' }
        : { state: 'blocked', reason: run.step.lastFailure }
}
