import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { navigateScenario, type ScenarioOutcome } from './scenarioNavigation'
import type { ScenarioRuntime } from './scenarioState'
import type { ScenarioTarget } from './scenarioTargets'

export function workingApproach(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    target: ScenarioTarget,
    now: number
): ScenarioOutcome {
    const outcome = approachWorkTarget(actor, run, room, target, now)
    return outcome.state === 'done'
        ? {
              state: 'blocked',
              reason: 'Объект всё ещё недостижим для взаимодействия.',
          }
        : outcome
}

export function approachWorkTarget(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    target: ScenarioTarget,
    now: number
): ScenarioOutcome {
    const bounds = target.resource?.bounds ?? target.chest?.bounds
    if (bounds === undefined) {
        return navigateScenario(
            actor,
            run,
            room,
            actor.locationId,
            target.position,
            target.chest === undefined ? 24 : 28,
            now
        )
    }
    const nav = room.navigationFor(actor)
    const candidates = [
        {
            x: Math.max(
                bounds.x,
                Math.min(actor.position.x, bounds.x + bounds.width)
            ),
            y: bounds.y - nav.grid.tileHeight,
        },
        {
            x: Math.max(
                bounds.x,
                Math.min(actor.position.x, bounds.x + bounds.width)
            ),
            y: bounds.y + bounds.height + nav.grid.tileHeight,
        },
        {
            x: bounds.x - nav.grid.tileWidth,
            y: Math.max(
                bounds.y,
                Math.min(actor.position.y, bounds.y + bounds.height)
            ),
        },
        {
            x: bounds.x + bounds.width + nav.grid.tileWidth,
            y: Math.max(
                bounds.y,
                Math.min(actor.position.y, bounds.y + bounds.height)
            ),
        },
    ].filter((point) => nav.findPathWorld(actor.position, point).length > 0)
    candidates.sort(
        (a, b) =>
            Math.hypot(actor.position.x - a.x, actor.position.y - a.y) -
            Math.hypot(actor.position.x - b.x, actor.position.y - b.y)
    )
    const point = candidates[0]
    return point === undefined
        ? { state: 'blocked', reason: 'Нет пути к доступному краю объекта.' }
        : navigateScenario(actor, run, room, actor.locationId, point, 4, now)
}
