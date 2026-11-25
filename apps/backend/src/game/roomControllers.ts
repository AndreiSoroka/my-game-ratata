import type { GameCharacter } from './character'
import { advanceCharacterControl } from './characterControl'
import { EchoController } from './echoController'
import { canYieldWhileIdle } from './idleNpcSpacing'
import type { GameRoom } from './room'
import type { SimulationContext } from './roomSimulation'
import { pauseWorkerActivity } from './workerActivityState'

export function advanceControllers(
    context: SimulationContext,
    reacting: ReadonlySet<string>,
    conversations: ReadonlySet<string>
): Set<string> {
    const { characters, controllers, room, now } = context
    const yielding = new Set<string>()
    for (const [id, controller] of controllers) {
        const character = characters.get(id)
        if (character === undefined) {
            room.scenarios.defer(id, now)
            continue
        }
        if (controller instanceof EchoController) {
            controller.update(character, room, now, conversations.has(id))
            continue
        }
        if (context.companions.prepareSafety(character, room, now)) {
            room.scenarios.defer(id, now)
            continue
        }
        if (room.social.exchanges.isPaused(id)) {
            pauseWorkerActivity(character, 'exchange', now)
            room.scenarios.defer(id, now)
            continue
        }
        if (reacting.has(id)) {
            pauseWorkerActivity(character, 'reaction', now)
            room.scenarios.defer(id, now)
            continue
        }
        if (context.companions.blocksScenario(character, now, room)) {
            pauseWorkerActivity(character, 'control', now)
            room.scenarios.defer(id, now)
            advanceCharacterControl(character, room, now)
            continue
        }
        if (
            room.scenarios.advance(character, room, now, conversations.has(id))
        ) {
            pauseWorkerActivity(character, 'scenario', now)
            continue
        }
        if (conversations.has(id)) {
            pauseWorkerActivity(character, 'conversation', now)
            continue
        }
        if (advanceCharacterControl(character, room, now)) {
            pauseWorkerActivity(character, 'control', now)
            continue
        }
        if (room.social.society.controlsVisit(character)) {
            pauseWorkerActivity(character, 'conversation', now)
            continue
        }
        room.scenarios.advancePolicy(character, controller, room, now)
        recordIdleYield(character, room, now, yielding)
    }
    return yielding
}

function recordIdleYield(
    character: GameCharacter,
    room: GameRoom,
    now: number,
    yielding: Set<string>
): void {
    if (!canYieldWhileIdle(character, now)) {
        return
    }
    const stage = room.workerRequests.forWorker(character.id)?.stage
    if (stage === undefined || stage === 'completed' || stage === 'cancelled') {
        yielding.add(character.id)
    }
}
