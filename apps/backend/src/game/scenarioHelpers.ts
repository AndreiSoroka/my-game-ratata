import type { ScenarioHelperSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ScenarioReports } from './scenarioReports'
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
        const run = runs.get(actor.id)
        const assigned =
            run?.snapshot.ownerId === owner.id && actor.id !== owner.id
        const report = reports.forOwner(owner.id, actor.id)
        if (
            actor.controllerKind === 'network_player' ||
            !actor.soul.canSpeak ||
            actor.id === owner.id
        ) {
            continue
        }
        if (!assigned && report === undefined && !nearby(owner, actor)) {
            continue
        }
        const allowed = access.canAssign(owner, actor, now)
        result.push({
            actorId: actor.id,
            name: actor.nickname,
            eligible: allowed.accepted,
            reason: allowed.error,
            canFollow: access.capabilities(actor).canFollow,
            run: assigned ? run.snapshot : (report ?? null),
        })
    }
    return result
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
