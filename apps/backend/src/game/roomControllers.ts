import type { GameCharacter } from './character'
import { advanceCharacterControl } from './characterControl'
import type { CharacterController } from './controllers'
import { EchoController } from './echoController'
import { EconomyWorkerController } from './economyWorkers'
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
            scenarioOwnsTick(
                controller,
                character,
                room,
                conversations.has(id),
                now
            )
        ) {
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
        if (advanceSocialController(character, room, now)) {
            continue
        }
        room.scenarios.advancePolicy(character, controller, room, now)
        recordIdleYield(character, room, now, yielding)
    }
    return yielding
}

function advanceSocialController(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): boolean {
    if (room.social.merchantVisits.advance(actor, now)) {
        return true
    }
    if (room.social.society.controlsVisit(actor)) {
        pauseWorkerActivity(actor, 'conversation', now)
        return true
    }
    return false
}

function scenarioOwnsTick(
    controller: CharacterController,
    actor: GameCharacter,
    room: GameRoom,
    conversing: boolean,
    now: number
): boolean {
    if (
        !conversing &&
        controller instanceof EconomyWorkerController &&
        room.scenarios.busy(actor.id) &&
        controller.advanceIncident(actor, room, now)
    ) {
        room.scenarios.defer(actor.id, now)
        return true
    }
    if (!room.scenarios.advance(actor, room, now, conversing)) {
        return false
    }
    pauseWorkerActivity(actor, 'scenario', now)
    return true
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
