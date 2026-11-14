import type {
    CharacterArchetype,
    CharacterVisualId,
    CreatureType,
    HeroClass,
} from '@my-game-ratata/contracts'

import { ArtisanController } from './artisanController'
import { GameCharacter } from './character'
import { artisanRecipes } from './cityEconomy'
import { cityResidents } from './cityResidents'
import { ClericController } from './clericController'
import { CompanionController } from './companionControllers'
import { companionProfiles, companionSoul } from './companionProfiles'
import type { CompanionService } from './companions'
import { NetworkPlayerController } from './controllers'
import { createItemInstance, equipDirect } from './inventory'
import type { NavigationService, TileCoordinate } from './navigation'
import type { SpawnedCharacter } from './spawns'

interface SupportDefinition {
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
        nickname: 'Торговец Савва',
        visualId: 'male_mage',
        tile: { x: 40, y: 60 },
    },
    {
        creatureType: 'humanoid',
        id: 'npc_cleric_1',
        nickname: 'Сестра Вера',
        heroClass: 'cleric',
        visualId: 'female_mage',
        tile: { x: 55, y: 27 },
    },
    {
        creatureType: 'humanoid',
        id: 'npc_scholar_1',
        nickname: 'Учёный Арен',
        visualId: 'male_mage',
        tile: { x: 66, y: 33 },
    },
    {
        creatureType: 'humanoid',
        id: 'npc_princess_1',
        nickname: 'Принцесса Лея',
        visualId: 'female_player',
        tile: { x: 27, y: 50 },
    },
    {
        creatureType: 'humanoid',
        id: 'npc_veteran_1',
        nickname: 'Ветеран Бран',
        visualId: 'male_player_2',
        tile: { x: 30, y: 50 },
    },
    {
        creatureType: 'humanoid',
        id: 'npc_guard_1',
        nickname: 'Стражница Рада',
        heroClass: 'ranger',
        visualId: 'female_player',
        tile: { x: 45, y: 43 },
    },
    {
        creatureType: 'ooze',
        id: 'npc_magic_slime_1',
        nickname: 'Капля',
        archetype: 'slime',
        visualId: 'slime',
        tile: { x: 22, y: 62 },
    },
]

export function createSupportNpcs(
    navigation: NavigationService,
    companions: CompanionService
): SpawnedCharacter[] {
    return definitions.map((definition) => {
        const profile = companionProfiles[definition.id]
        const character = new GameCharacter({
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
            spawnPosition: safeSpawn(navigation, definition.tile),
            visualId: definition.visualId,
        })
        if (definition.id === 'npc_guard_1') {
            character.tags.add('guard')
        }
        if (definition.id === 'npc_cleric_1') {
            character.tags.add('cleric')
        }
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

function safeSpawn(
    navigation: NavigationService,
    desired: TileCoordinate
): { x: number; y: number } {
    const x = Math.max(0, Math.min(navigation.grid.width - 1, desired.x))
    const y = Math.max(0, Math.min(navigation.grid.height - 1, desired.y))
    for (
        let radius = 0;
        radius < Math.max(navigation.grid.width, navigation.grid.height);
        radius += 1
    ) {
        for (let dy = -radius; dy <= radius; dy += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                const tile = { x: x + dx, y: y + dy }
                if (!navigation.isSolidTile(tile)) {
                    return navigation.tileToWorld(tile)
                }
            }
        }
    }
    throw new Error('Map has no walkable support NPC spawn')
}
