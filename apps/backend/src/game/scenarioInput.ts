import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { cancelScenarioFollow, type ScenarioRuntime } from './scenarioState'

export function pauseScenario(
    actor: GameCharacter,
    run: ScenarioRuntime | undefined
): void {
    if (run?.snapshot.status === 'running') {
        run.snapshot.status = 'paused'
        stopScenarioControl(actor, run)
    }
}

export function resumeScenario(
    actor: GameCharacter,
    run: ScenarioRuntime,
    now: number
): string | null {
    if (run.snapshot.status !== 'paused') {
        return 'Этот сценарий не приостановлен.'
    }
    cancelCharacterControl(actor)
    run.snapshot.status = 'running'
    run.lastAt = now
    run.step.previousDistance = Infinity
    run.step.lastPlanAt = -Infinity
    return null
}

export function stopScenarioControl(
    actor: GameCharacter,
    run: ScenarioRuntime
): void {
    cancelScenarioFollow(actor, run)
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
}

export function releaseScenarioInput(
    actor: GameCharacter,
    running: boolean,
    receivedAt?: number
): null {
    if (!running) {
        cancelCharacterControl(actor)
    }
    actor.setMoveInput({ x: 0, y: 0 }, receivedAt)
    return null
}
