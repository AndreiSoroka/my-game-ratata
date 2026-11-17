import type { WorldSnapshot } from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { observeGraveCombat } from './combatObservation'
import type { PartyService } from './parties'
import { createSnapshot } from './queries'
import type { RoomLife } from './roomLife'
import { charactersInLocation } from './roomQueries'
import { projectRoomCharacter } from './roomSnapshotCharacter'
import type { RoomSocial } from './roomSocial'
import type { ScenarioService } from './scenarios'
import { serverEpoch } from './serverEpoch'
import type { TheftService } from './theft'
import type { WorldLocations } from './worldLocations'
import { centerLocationId } from './worldLocations'

export interface SnapshotContext {
    social?: RoomSocial
    adventure: AdventureService
    characters: Map<string, GameCharacter>
    parties: PartyService
    theft: TheftService
    tick: number
    world: WorldLocations
    life?: RoomLife
}

export function createRoomSnapshotter(
    context: () => SnapshotContext,
    scenarios: ScenarioService
) {
    return (
        now = Date.now(),
        locationId = centerLocationId,
        playerId?: string
    ): WorldSnapshot => {
        const state = context()
        const snapshot = roomSnapshot(state, now, locationId, playerId)
        const observer =
            playerId === undefined ? undefined : state.characters.get(playerId)
        if (observer !== undefined) {
            snapshot.automation = scenarios.snapshot(observer, now)
        }
        return snapshot
    }
}

export function roomSnapshot(
    context: SnapshotContext,
    now: number,
    locationId: string,
    playerId?: string
): WorldSnapshot {
    const location = context.world.get(locationId)
    const observer =
        playerId === undefined ? undefined : context.characters.get(playerId)
    const combatView = {
        observer,
        getCharacter: (id: string) => context.characters.get(id),
        navigation: location.navigation,
        now,
    }
    const snapshot = createSnapshot(
        charactersInLocation(context.characters, locationId).values(),
        location.inventory.snapshotItems(),
        location.inventory.snapshotChests(),
        context.tick,
        now,
        playerId
    )
    return {
        ...snapshot,
        serverEpoch,
        graves: (context.life?.graves(locationId) ?? []).map((grave) =>
            observeGraveCombat(grave, combatView)
        ),
        characters: snapshot.characters.map((character) =>
            projectRoomCharacter(context, character, combatView, playerId)
        ),
        location: location.description,
        ...(playerId === undefined
            ? {}
            : {
                  chest: location.inventory.containers.snapshot(
                      context.characters.get(playerId),
                      now
                  ),
                  adventure: context.adventure.snapshot(
                      playerId,
                      locationId,
                      context.characters.get(playerId)
                  ),
                  party: context.parties.snapshot(playerId),
                  ...(observer === undefined || context.social === undefined
                      ? {}
                      : { social: context.social.snapshot(observer, now) }),
              }),
    }
}
