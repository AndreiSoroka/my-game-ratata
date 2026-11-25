import type { AutomationCommand } from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import type { CompanionService } from './companions'
import { visibleBuildingPoint } from './mapBuildings'
import { recruitableNpc } from './npcRoster'
import type { GameRoom } from './room'
import { ScenarioService } from './scenarios'
import { createWandererScenario } from './wandererScenarios'
import type { WorldLocations } from './worldLocations'

export function createRoomScenarioService(
    room: GameRoom,
    companions: CompanionService,
    characters: () => Iterable<GameCharacter>,
    adventure: AdventureService
): ScenarioService {
    const context = {
        modelConsent: true,
        tileWidthFor: (actor: GameCharacter) =>
            room.navigationFor(actor).grid.tileWidth,
        questCompleted: (actorId: string, questId: string) =>
            adventure.hasCompletedQuest(actorId, questId),
        hasLineOfSight: (actor: GameCharacter, npc: GameCharacter) =>
            room
                .navigationFor(actor)
                .hasLineOfSight(actor.position, npc.position),
    }
    const hasConsent = (ownerId: string, actor: GameCharacter) =>
        recruitableNpc(actor.id) && companions.hasConsent(ownerId, actor)
    const requireConsent = (owner: GameCharacter, actor: GameCharacter) =>
        hasConsent(owner.id, actor)
            ? undefined
            : {
                  accepted: false,
                  error: 'Попросите спутника согласиться в разговоре.',
              }
    return new ScenarioService({
        characters,
        canAssign: (owner, actor, now) =>
            requireConsent(owner, actor) ??
            companions.canAssist(owner, actor, context, now),
        claim: (owner, actor, now) =>
            requireConsent(owner, actor) ??
            companions.claimAssistance(owner, actor, context, now),
        hasConsent,
        canObserve: (owner, actor, now) => {
            if (owner.locationId !== actor.locationId) {
                return false
            }
            const navigation = room.navigationFor(owner)
            return (
                canObserveRoomCharacter(owner, actor, navigation, now) &&
                visibleBuildingPoint(
                    navigation.grid.buildings ?? [],
                    owner.position,
                    actor.position
                ) &&
                navigation.hasLineOfSight(owner.position, actor.position)
            )
        },
        release: (ownerId, actor) => {
            companions.releaseAssistance(ownerId, actor)
        },
        capabilities: (actor) => companions.capabilities(actor),
    })
}
export function createScenarioEnvironment(world: () => WorldLocations) {
    return (actor: GameCharacter) => {
        const inventory = world().get(actor.locationId).inventory
        return {
            chests: inventory.snapshotChests(),
            items: inventory.snapshotItems(),
        }
    }
}

export function createScenarioRequester(
    room: GameRoom,
    scenarios: ScenarioService
) {
    return (actor: GameCharacter, command: AutomationCommand, now: number) => {
        const error = scenarios.handle(actor, command, room, now)
        return { accepted: error === null, error, events: [] }
    }
}

export function registerWandererScenarios(
    room: GameRoom,
    scenarios: ScenarioService,
    characters: Iterable<GameCharacter>
): void {
    for (const character of characters) {
        const definition = createWandererScenario(
            character,
            room.navigationFor(character)
        )
        if (definition !== undefined) {
            scenarios.registerDefault(character, definition, room.gameplayNow())
        }
    }
}
