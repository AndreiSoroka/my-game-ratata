import type { GameEventPayload, Vector2 } from '@my-game-ratata/contracts'

import type { AgentDecisionResult, CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { enqueueCharacterRoute } from './characterRoute'
import { cancelPrayerCast } from './prayerCancellation'
import {
    routeCommandFeedback,
    routeRejectionText,
} from './routeCommandFeedback'

export function applyAgentRoute(
    character: GameCharacter,
    target: Vector2,
    append: boolean,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    const navigation = world.navigationFor(character)
    if (
        target.x < 0 ||
        target.y < 0 ||
        target.x > navigation.summary.worldWidth ||
        target.y > navigation.summary.worldHeight
    ) {
        return {
            accepted: false,
            error: 'Destination is outside this location',
            events: [],
        }
    }
    const events: GameEventPayload[] = []
    const result = enqueueCharacterRoute(
        character,
        target,
        append,
        navigation,
        now,
        () => {
            world.requestControl?.(character, { type: 'cancel_control' }, now)
        }
    )
    if (result.accepted) {
        events.push(...cancelPrayerCast(character, now))
    }
    events.push(...routeCommandFeedback(character, result))
    return {
        accepted: result.accepted,
        error: result.accepted ? null : routeRejectionText(result.reason),
        events,
    }
}
