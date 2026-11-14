import type { ScenarioHelperSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ScenarioAccess } from './scenarios'
import type { ScenarioRuntime } from './scenarioState'

export function scenarioHelpers(
    access: ScenarioAccess,
    runs: ReadonlyMap<string, ScenarioRuntime>,
    owner: GameCharacter,
    now: number
): ScenarioHelperSnapshot[] {
    const result: ScenarioHelperSnapshot[] = []
    for (const actor of access.characters()) {
        const run = runs.get(actor.id)
        const assigned =
            run?.snapshot.ownerId === owner.id && actor.id !== owner.id
        if (
            actor.controllerKind === 'network_player' ||
            !actor.soul.canSpeak ||
            actor.id === owner.id
        ) {
            continue
        }
        if (
            !assigned &&
            (actor.locationId !== owner.locationId ||
                Math.hypot(
                    actor.position.x - owner.position.x,
                    actor.position.y - owner.position.y
                ) > 64)
        ) {
            continue
        }
        const allowed = access.canAssign(owner, actor, now)
        result.push({
            actorId: actor.id,
            name: actor.nickname,
            eligible: allowed.accepted,
            reason: allowed.error,
            ...access.capabilities(actor),
            run: assigned ? run.snapshot : null,
        })
    }
    return result
}
