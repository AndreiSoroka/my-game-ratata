import type {
    AdventureSnapshot,
    MagicEffectSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { observeGraveCombat } from './combatObservation'
import { heardFootsteps } from './hearing'
import type { NavigationService } from './navigation'
import type { PartyService } from './parties'
import { createSnapshot } from './queries'
import type { GameRoom } from './room'
import type { RoomLife } from './roomLife'
import { charactersInLocation } from './roomQueries'
import { projectRoomCharacter } from './roomSnapshotCharacter'
import type { RoomSocial } from './roomSocial'
import { serverEpoch } from './serverEpoch'
import type { TheftService } from './theft'
import type { WorldLocations } from './worldLocations'
import { centerLocationId, type LocationState } from './worldLocations'

export interface SnapshotContext {
    social?: RoomSocial
    adventure: AdventureService
    characters: Map<string, GameCharacter>
    parties: PartyService
    theft: TheftService
    tick: number
    world: WorldLocations
    life?: RoomLife
    magicEffects?: (locationId: string, now: number) => MagicEffectSnapshot[]
}

export function createRoomSnapshotter(
    context: () => SnapshotContext,
    room: GameRoom
) {
    return (
        now = room.gameplayNow(),
        locationId = centerLocationId,
        playerId?: string
    ): WorldSnapshot => {
        const state = context()
        const snapshot = roomSnapshot(state, now, locationId, playerId)
        const observer =
            playerId === undefined ? undefined : state.characters.get(playerId)
        if (observer !== undefined) {
            snapshot.automation = room.scenarios.snapshot(observer, now)
            if (observer.locationId === locationId) {
                const footsteps = heardFootsteps(room, observer, now)
                if (footsteps.length > 0) {
                    snapshot.heardFootsteps = footsteps
                }
            }
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
        location.inventory.snapshotChests(now, observer),
        context.tick,
        now,
        location.navigation,
        playerId
    )
    const portals = context.world.portals.snapshot(locationId, now)
    return {
        ...snapshot,
        serverEpoch: context.world.serverEpoch ?? serverEpoch,
        magicEffects: context.magicEffects?.(locationId, now) ?? [],
        graves: (context.life?.graves(locationId) ?? []).map((grave) =>
            observeGraveCombat(grave, combatView)
        ),
        characters: snapshot.characters.map((character) =>
            projectRoomCharacter(context, character, combatView, playerId)
        ),
        location: location.description,
        ...(portals.length === 0 ? {} : { portals }),
        ...dungeonView(location, observer, now),
        ...(playerId === undefined
            ? {}
            : {
                  chest: location.inventory.containers.snapshot(
                      context.characters.get(playerId),
                      now
                  ),
                  adventure: adventureForObserver(
                      context,
                      locationId,
                      playerId,
                      observer,
                      location.navigation,
                      now
                  ),
                  party: context.parties.snapshot(playerId),
                  ...(observer === undefined || context.social === undefined
                      ? {}
                      : { social: context.social.snapshot(observer, now) }),
              }),
    }
}

function adventureForObserver(
    context: SnapshotContext,
    locationId: string,
    playerId: string,
    observer: GameCharacter | undefined,
    navigation: NavigationService,
    now: number
): AdventureSnapshot {
    const adventure = context.adventure.snapshot(
        playerId,
        locationId,
        observer,
        now
    )
    if (adventure.dialogue?.kind !== 'quest_board') {
        return adventure
    }
    const objectId = adventure.dialogue.npcId
    if (
        observer?.locationId !== locationId ||
        context.social === undefined ||
        !context.adventure.canReadQuestBoard(
            observer,
            objectId,
            navigation,
            now
        )
    ) {
        return { ...adventure, dialogue: null }
    }
    return {
        ...adventure,
        questBoard: {
            objectId,
            entries: context.social.questBoardEntries(observer, now),
        },
    }
}

function dungeonView(
    location: LocationState,
    observer: GameCharacter | undefined,
    now: number
): Pick<WorldSnapshot, 'dungeonReveals' | 'dungeonDraft'> {
    const secrets = location.secrets
    if (secrets === undefined) {
        return {}
    }
    const dungeonReveals = secrets.snapshot
    return {
        ...(dungeonReveals.length === 0 ? {} : { dungeonReveals }),
        ...(isDraftListener(location.description.id, observer, now) &&
        secrets.draftAt(
            observer.position,
            Math.hypot(observer.velocity.x, observer.velocity.y) > 0.0001
        )
            ? { dungeonDraft: true }
            : {}),
    }
}

function isDraftListener(
    locationId: string,
    observer: GameCharacter | undefined,
    now: number
): observer is GameCharacter {
    return (
        observer?.locationId === locationId &&
        observer.alive &&
        observer.connected &&
        !observer.tags.has('offline') &&
        observer.movement.dashUntil <= now &&
        observer.combat.lunge === undefined
    )
}
