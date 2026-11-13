import type {
    CharacterRelationship,
    ProgressionSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import type { PartyService } from './parties'
import { createSnapshot } from './queries'
import { charactersInLocation } from './roomQueries'
import type { TheftService } from './theft'
import type { WorldLocations } from './worldLocations'

interface SnapshotContext {
    adventure: AdventureService
    characters: Map<string, GameCharacter>
    parties: PartyService
    theft: TheftService
    tick: number
    world: WorldLocations
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
    const snapshot = createSnapshot(
        charactersInLocation(context.characters, locationId).values(),
        location.inventory.snapshotItems(),
        location.inventory.snapshotChests(),
        context.tick,
        now
    )
    return {
        ...snapshot,
        characters: snapshot.characters.map((character) => ({
            ...character,
            relationship: relationshipFor(
                observer,
                context.characters.get(character.id),
                playerId,
                now
            ),
            control:
                character.id === playerId
                    ? (character.control ?? {
                          mode: 'none' as const,
                          targetId: null,
                      })
                    : { mode: 'none' as const, targetId: null },
            inventory: character.id === playerId ? character.inventory : [],
            ...(character.id !== playerId && character.progression !== undefined
                ? { progression: publicProgression(character.progression) }
                : {}),
            theft: context.theft.snapshot(character.id, playerId, now),
        })),
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
              }),
    }
}

function relationshipFor(
    observer: GameCharacter | undefined,
    target: GameCharacter | undefined,
    playerId: string | undefined,
    now: number
): CharacterRelationship {
    if (target === undefined) {
        return 'friendly'
    }
    if (target.id === playerId) {
        return 'self'
    }
    return observer !== undefined && canTargetByFaction(observer, target, now)
        ? 'hostile'
        : 'friendly'
}

function publicProgression(
    progression: ProgressionSnapshot
): ProgressionSnapshot {
    return {
        ...progression,
        skills: progression.skills.map((skill) => ({
            ...skill,
            practice: 0,
            practiceToNext: 0,
        })),
        practicedBranches: [],
        trainingMultiplier: 1,
    }
}
