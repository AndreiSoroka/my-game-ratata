import {
    CENTER_LOCATION_ID,
    type CharacterArchetype,
    type CharacterVisualId,
    type CityBellState,
    type CreatureType,
    type HeroClass,
    type PrayerAbilityId,
    type Vector2,
} from '@my-game-ratata/contracts'

import { ArtisanController } from './artisanController'
import { GameCharacter } from './character'
import { artisanRecipes } from './cityEconomy'
import { cityResidents } from './cityResidents'
import { ClericController } from './clericController'
import { CompanionController } from './companionControllers'
import { companionProfiles, companionSoul } from './companionProfiles'
import type { CompanionService } from './companions'
import { syncAbilityConstellations } from './constellations'
import { NetworkPlayerController } from './controllers'
import { createItemInstance, equipDirect } from './inventory'
import { citySpawnPosition } from './mapCityAnchors'
import type { NavigationService, TileCoordinate } from './navigation'
import type { NpcIdentityKey } from './npcIdentityCatalog'
import type { SpawnedCharacter } from './spawns'

interface SupportDefinition {
    anchorId?: string
    spawnOffset?: Vector2
    requiresCityState?: { locationId: string; state: CityBellState }
    knownPrayers?: readonly PrayerAbilityId[]
    npcIdentityKey?: NpcIdentityKey
    archetype?: CharacterArchetype
    heroClass?: HeroClass
    id: string
    nickname: string
    tile: TileCoordinate
    creatureType: CreatureType
    visualId: CharacterVisualId
}

const definitions: SupportDefinition[] = [
    ...cityResidents,
    {
        creatureType: 'humanoid',
        id: 'npc_merchant_1',
        anchorId: 'service.shop',
        nickname: 'Торговец Савва',
        visualId: 'male_mage',
        tile: { x: 40, y: 60 },
    },
    {
        creatureType: 'humanoid',
        id: 'npc_cleric_1',
        anchorId: 'service.chapel',
        npcIdentityKey: 'vera',
        nickname: 'Сестра Вера',
        heroClass: 'cleric',
        knownPrayers: ['pray', 'pray_road'],
        visualId: 'female_mage',
        tile: { x: 55, y: 27 },
    },
    {
        creatureType: 'humanoid',
        id: 'npc_scholar_1',
        anchorId: 'service.library',
        nickname: 'Учёный Арен',
        visualId: 'male_mage',
        tile: { x: 66, y: 33 },
    },
    {
        creatureType: 'humanoid',
        id: 'npc_princess_1',
        anchorId: 'service.inn.princess',
        nickname: 'Принцесса Лея',
        visualId: 'female_player',
        tile: { x: 27, y: 50 },
    },
    {
        creatureType: 'humanoid',
        id: 'npc_veteran_1',
        anchorId: 'service.inn',
        spawnOffset: { x: 16, y: 0 },
        nickname: 'Ветеран Бран',
        visualId: 'male_player_2',
        tile: { x: 30, y: 50 },
    },
    {
        creatureType: 'humanoid',
        id: 'npc_guard_1',
        anchorId: 'service.guild',
        spawnOffset: { x: 16, y: 16 },
        nickname: 'Стражница Рада',
        heroClass: 'ranger',
        visualId: 'female_player',
        tile: { x: 45, y: 43 },
    },
    {
        creatureType: 'ooze',
        id: 'npc_magic_slime_1',
        anchorId: 'service.chapel',
        spawnOffset: { x: -16, y: 16 },
        requiresCityState: { locationId: CENTER_LOCATION_ID, state: 'active' },
        npcIdentityKey: 'kaplya',
        nickname: 'Капля',
        archetype: 'slime',
        visualId: 'slime',
        tile: { x: 22, y: 62 },
    },
]

export function createSupportNpcs(
    navigation: NavigationService,
    companions: CompanionService,
    options: {
        onlyIds?: readonly string[]
        cityState?: (locationId: string) => CityBellState | undefined
    } = {}
): SpawnedCharacter[] {
    return eligibleDefinitions(options).map((definition) => {
        const profile = companionProfiles[definition.id]
        const character = new GameCharacter({
            npcIdentityKey: definition.npcIdentityKey,
            archetype: definition.archetype ?? 'human',
            creatureType: definition.creatureType,
            controllerKind: 'scripted',
            faction: 'peaceful',
            ...(definition.heroClass === undefined
                ? {}
                : { heroClass: definition.heroClass }),
            id: definition.id,
            mortal: profile !== undefined,
            nickname: definition.nickname,
            soul: companionSoul(definition.id),
            spawnPosition: citySpawnPosition(
                navigation,
                definition.anchorId ?? `resident.${definition.id}`,
                definition.tile,
                definition.spawnOffset
            ),
            visualId: definition.visualId,
        })
        if (definition.id === 'npc_guard_1') {
            character.tags.add('guard')
        }
        if (definition.id === 'npc_cleric_1') {
            character.tags.add('cleric')
        }
        initializeKnownPrayers(character, definition.knownPrayers)
        if (definition.id === 'npc_scholar_1') {
            character.tags.add('scholar')
        }
        if (definition.id === 'npc_veteran_1') {
            equipDirect(character.equipment, createItemInstance('old_sword'))
        }
        if (profile !== undefined) {
            character.soul.companion = {
                canFight: profile.canFight,
                lastReply: null,
                leaderId: null,
                order: 'idle',
            }
        }
        return {
            character,
            controller:
                artisanRecipes(definition.id).length > 0
                    ? new ArtisanController()
                    : definition.heroClass === 'cleric'
                      ? new ClericController()
                      : profile === undefined
                        ? new NetworkPlayerController()
                        : new CompanionController(companions),
        }
    })
}

interface SupportSpawnOptions {
    onlyIds?: readonly string[]
    cityState?: (locationId: string) => CityBellState | undefined
}
function eligibleDefinitions(
    options: SupportSpawnOptions
): SupportDefinition[] {
    return definitions.filter((definition) => {
        if (
            options.onlyIds !== undefined &&
            !options.onlyIds.includes(definition.id)
        ) {
            return false
        }
        const required = definition.requiresCityState
        const actual =
            required === undefined
                ? undefined
                : options.cityState?.(required.locationId)
        return actual === undefined || actual === required?.state
    })
}

function initializeKnownPrayers(
    character: GameCharacter,
    prayers: readonly PrayerAbilityId[] = []
): void {
    if (prayers.length === 0) {
        return
    }
    for (const id of prayers) {
        character.abilities.known.add(id)
    }
    syncAbilityConstellations(character)
}

/** Authored public service homes, not live actor positions. */
export function supportNpcHomeDefinitions(navigation?: NavigationService) {
    return definitions.map(
        ({ id, nickname, tile, anchorId, spawnOffset, requiresCityState }) => ({
            id,
            name: nickname,
            tile: { ...tile },
            ...(requiresCityState === undefined
                ? {}
                : { requiresCityState: { ...requiresCityState } }),
            ...(navigation === undefined
                ? {}
                : {
                      position: citySpawnPosition(
                          navigation,
                          anchorId ?? `resident.${id}`,
                          tile,
                          spawnOffset
                      ),
                  }),
        })
    )
}
