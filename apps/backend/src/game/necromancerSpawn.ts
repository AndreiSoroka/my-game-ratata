import {
    ASH_RITE_RULES,
    type Vector2,
    WESTERN_RUINS_LOCATION_ID,
} from '@my-game-ratata/contracts'

import { bindAshSkeleton } from './ashSkeletonState'
import { GameCharacter } from './character'
import { chestHasLineOfSight } from './chestInteraction'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { NecromancerController } from './necromancerController'
import { initializeNpcProgression } from './npcProgression'
import { registerSavvaTerritory, SAVVA_ID } from './savvaTerritory'
import { createSkeleton, type SpawnedCharacter } from './spawns'
import type { LocationState } from './worldLocations'

export function spawnNecromancer(
    location: LocationState
): (SpawnedCharacter & { skeletons: SpawnedCharacter[] }) | undefined {
    const { navigation, inventory } = location
    const refuge = navigation.grid.encounters?.ashRefuge
    if (
        location.description.id !== WESTERN_RUINS_LOCATION_ID ||
        refuge === undefined
    ) {
        return undefined
    }
    const chest = inventory.containers.ritualChest(refuge.chestId)
    const landmarks = (navigation.grid.landmarks ?? []).filter(({ kind }) =>
        ['ash_headstone', 'ash_grave', 'ash_collapse'].includes(kind)
    )
    const road = navigation.tileToWorld({
        x: Math.floor(navigation.grid.width / 2),
        y: Math.floor(navigation.grid.height / 2),
    })
    if (
        chest === undefined ||
        distance(chest.position, refuge.chest) > navigation.grid.tileWidth ||
        !chestHasLineOfSight(refuge.home, chest.position, navigation) ||
        new Set(landmarks.map(({ kind }) => kind)).size !== 3 ||
        navigation.findPathWorld(road, refuge.home).length === 0 ||
        landmarks.some(
            ({ position }) =>
                navigation.findPathWorld(refuge.home, position).length === 0
        )
    ) {
        throw new Error(
            'Generated Ash refuge must be reachable with a chest and three landmarks'
        )
    }
    const character = new GameCharacter({
        id: SAVVA_ID,
        nickname: 'Савва',
        npcIdentityKey: 'savva',
        archetype: 'human',
        controllerKind: 'scripted',
        ashPact: true,
        faction: 'peaceful',
        mortal: true,
        respawnPolicy: 'none',
        locationId: location.description.id,
        spawnPosition: refuge.home,
        visualId: 'necromancer',
    })
    teachSavvaAsh(character)
    character.maxHp = 100
    character.hp = character.maxHp
    registerSavvaTerritory(character, refuge.home)

    const mound = landmarks.find(({ kind }) => kind === 'ash_grave')
    if (mound !== undefined) {
        inventory.deathLoot.seedRemains(mound.id, mound.position)
    }
    return {
        character,
        skeletons: createRefugeSkeletons(character, navigation, chest.position),
        controller: new NecromancerController({
            home: refuge.home,
            landmarks,
            chestId: refuge.chestId,
        }),
    }
}

function teachSavvaAsh(character: GameCharacter): void {
    character.progression.patron = 'grave'
    character.abilities.known.add('pray_grave')
    character.progression.masteries.prayer_grave.level = 5
    for (const star of [
        'heal_power1',
        'heal_power2',
        'heal_chance1',
        'heal_radius1',
    ]) {
        character.progression.constellations.opened.add(`prayer_grave.${star}`)
    }
    initializeNpcProgression(character)
}

function createRefugeSkeletons(
    owner: GameCharacter,
    navigation: NavigationService,
    chest: Vector2
): SpawnedCharacter[] {
    const origin = navigation.worldToTile(owner.position)
    const candidates = []
    for (let y = -3; y <= 3; y++) {
        for (let x = -3; x <= 3; x++) {
            const tile = { x: origin.x + x, y: origin.y + y }
            const point = navigation.tileToWorld(tile)
            if (
                !navigation.isSolidTile(tile) &&
                distance(owner.position, point) >= navigation.grid.tileWidth &&
                navigation.hasLineOfSight(owner.position, point)
            ) {
                candidates.push({ tile, point })
            }
        }
    }
    candidates.sort(
        (a, b) => distance(a.point, chest) - distance(b.point, chest)
    )
    const points: typeof candidates = []
    for (const candidate of candidates) {
        if (
            navigation.findPathWorld(owner.position, candidate.point).length > 0
        ) {
            points.push(candidate)
            if (points.length === ASH_RITE_RULES.orderSlots) {
                break
            }
        }
    }
    if (points.length !== ASH_RITE_RULES.orderSlots) {
        throw new Error(
            'Generated Ash refuge needs space for Savva’s skeleton guard'
        )
    }
    return points.map(({ tile, point }, index) => {
        const entry = createSkeleton(
            navigation,
            `_savva_guard_${String(index + 1)}`,
            tile,
            'none',
            true
        )
        bindAshSkeleton(
            entry.character,
            owner,
            index === 0
                ? { locationId: owner.locationId, position: point }
                : undefined
        )
        return entry
    })
}
