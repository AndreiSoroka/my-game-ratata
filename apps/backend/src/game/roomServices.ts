import type { NpcAiCoordinator } from '../ai/coordinator'
import { AdventureService } from './adventure'
import { adventureWorldOptions } from './adventureWorld'
import type { GameCharacter } from './character'
import type { CompanionService } from './companions'
import { createRoomScavenger } from './mobScavenging'
import { NpcConflict } from './npcConflict'
import type { GameRoom } from './room'
import { RoomEventPipeline } from './roomEventPipeline'
import type { RoomLife } from './roomLife'
import type { RoomSocket } from './roomMessaging'
import {
    createRoomScenarioService,
    createScenarioRequester,
} from './roomScenarios'
import { createRoomSnapshotter } from './roomSnapshot'
import { RoomSocial } from './roomSocial'
import { createRoomTheftRequester } from './roomTheft'
import { createRoomParties } from './roomWorkerRequests'
import type { TheftService } from './theft'
import type { WorldLocations } from './worldLocations'

interface Options {
    room: GameRoom
    characters: Map<string, GameCharacter>
    connections: Map<RoomSocket, string | undefined>
    world: () => WorldLocations
    companions: CompanionService
    life: RoomLife
    theft: TheftService
    ai: () => NpcAiCoordinator | undefined
    tick: () => number
}

export interface RoomServices {
    adventure: AdventureService
    scenarios: ReturnType<typeof createRoomScenarioService>
    parties: ReturnType<typeof createRoomParties>
    social: RoomSocial
    events: RoomEventPipeline
    requestTheft: ReturnType<typeof createRoomTheftRequester>
    requestScavenge: ReturnType<typeof createRoomScavenger>
    requestAutomation: ReturnType<typeof createScenarioRequester>
    snapshot: ReturnType<typeof createRoomSnapshotter>
}

export function createRoomServices(options: Options): RoomServices {
    const {
        room,
        characters,
        connections,
        companions,
        life,
        theft,
        ai,
        world,
        tick,
    } = options
    const adventure = new AdventureService({
        ...adventureWorldOptions(world),
        now: room.gameplayNow,
    })
    const scenarios = createRoomScenarioService(
        room,
        companions,
        () => characters.values(),
        adventure
    )
    const parties = createRoomParties(room, adventure)
    const social = new RoomSocial(room, adventure, parties, ai, () =>
        characters.values()
    )
    const observeCombat = createCombatObserver(options, social)
    const events = new RoomEventPipeline(
        characters,
        connections,
        adventure,
        parties,
        social,
        {
            archivePerson: (id, now) => ai()?.archivePerson(id, now),
            hasModelLease: (actor, now) =>
                companions.hasActiveLease(actor, now, room),
            observeCombat,
            world,
            now: room.gameplayNow,
            speechTranslations: () => room.speechTranslations,
        }
    )
    return {
        adventure,
        scenarios,
        parties,
        social,
        events,
        requestScavenge: createRoomScavenger(world, (events) =>
            room.publishEvents(events)
        ),
        requestTheft: createRoomTheftRequester(
            theft,
            adventure,
            characters,
            room.navigationFor
        ),
        requestAutomation: createScenarioRequester(room, scenarios),
        snapshot: createRoomSnapshotter(
            () => ({
                adventure,
                theft,
                characters,
                parties,
                tick: tick(),
                world: world(),
                life,
                social,
                magicEffects: room.magicEffectsFor,
            }),
            room
        ),
    }
}

function createCombatObserver(options: Options, social: RoomSocial) {
    const { room, theft, characters, ai } = options
    const conflict = new NpcConflict(room, theft, social.society.history, () =>
        characters.values()
    )
    social.society.conflicts = conflict
    theft.onCaught = conflict.onCaught
    theft.reconsider = conflict.reconsider
    theft.onAbsolved = conflict.clearEvidence
    return (events: Parameters<NpcConflict['onCombat']>[0], now: number) => {
        const fresh = conflict.onCombat(events, now)
        ai()?.observeCombat(fresh, now)
    }
}
