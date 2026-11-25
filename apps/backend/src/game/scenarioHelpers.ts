import type { ScenarioHelperSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { hideScenarioReaction, type ScenarioReports } from './scenarioReports'
import type { ScenarioAccess } from './scenarios'
import type { ScenarioRuntime } from './scenarioState'

export function scenarioHelpers(
    access: ScenarioAccess,
    runs: ReadonlyMap<string, ScenarioRuntime>,
    owner: GameCharacter,
    now: number,
    reports: ScenarioReports
): ScenarioHelperSnapshot[] {
    const result: ScenarioHelperSnapshot[] = []
    for (const actor of access.characters()) {
        if (
            actor.controllerKind === 'network_player' ||
            !actor.soul.canSpeak ||
            actor.id === owner.id
        ) {
            continue
        }
        const run = runs.get(actor.id)
        const assigned = run?.snapshot.ownerId === owner.id ? run : undefined
        const canObserve = () => access.canObserve?.(owner, actor, now) ?? true
        const report = reports.forOwner(owner.id, actor.id, canObserve)
        if (
            assigned === undefined &&
            report === undefined &&
            !nearby(owner, actor)
        ) {
            continue
        }
        const allowed = access.canAssign(owner, actor, now)
        result.push({
            actorId: actor.id,
            name: actor.nickname,
            eligible: allowed.accepted,
            reason: allowed.error,
            canFollow: access.capabilities(actor).canFollow,
            run:
                assigned === undefined
                    ? (report ?? null)
                    : projectRun(assigned, canObserve()),
        })
    }
    return result
}

function projectRun(run: ScenarioRuntime, visible: boolean) {
    return visible
        ? run.snapshot
        : hideScenarioReaction(run.snapshot, run.definition.main.length)
}

function nearby(owner: GameCharacter, actor: GameCharacter): boolean {
    return (
        actor.locationId === owner.locationId &&
        Math.hypot(
            actor.position.x - owner.position.x,
            actor.position.y - owner.position.y
        ) <= 64
    )
}
