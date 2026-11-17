import {
    CENTER_LOCATION_ID,
    getWorldLocationDefinition,
    REGION_NAME,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import { adventureQuest } from '../game/adventureContent'
import type { GameCharacter } from '../game/character'
import { companionProfiles } from '../game/companionProfiles'
import { snapshotConstellations } from '../game/constellationSnapshot'
import {
    containsBuildingPoint,
    type MapBuildingDefinition,
} from '../game/mapBuildings'
import type { NavigationService } from '../game/navigation'
import { prepareConstellationLayout } from '../game/personalConstellationSky'
import { residentDialogue } from '../game/residentDialogue'
import { supportNpcHomeDefinitions } from '../game/supportNpcs'

export interface KnowledgeEntry {
    id: string
    group: string
    text: string
    source: string
    locationId?: string
    buildingId?: string
}
/** Knowledge grants describe learned information, never controller privileges or powers. */
export function characterKnowledge(
    actor: GameCharacter,
    navigation: NavigationService
): KnowledgeEntry[] {
    const groups = new Set(['world.common', 'world.geography'])
    if (getWorldLocationDefinition(actor.spawnLocationId)?.biome === 'city') {
        groups.add('city.local')
    }
    if (actor.tags.has('cleric')) {
        groups.add('prayer.doctrine')
    }
    addScholarKnowledge(actor, groups)
    const entries: KnowledgeEntry[] = [
        {
            id: 'world:region',
            group: 'world.common',
            source: 'authored:world',
            text: `${REGION_NAME}. Север находится сверху карты, юг снизу, запад слева, восток справа. Переходят между соседними местами через края локации.`,
        },
        {
            id: 'city:bell',
            group: 'city.local',
            source: `authored:${adventureQuest.id}`,
            text: `В Новогороде есть колокол памяти. ${adventureQuest.description}`,
        },
        {
            id: 'prayer:theory',
            group: 'prayer.doctrine',
            source: 'authored:development',
            text: 'Созвездия открываются через осмысленную практику. Каждый персонаж имеет собственное небо и изученные звёзды. Начальное призвание не запрещает учиться другому делу. Знание чужого объяснения не открывает звезду автоматически.',
        },
        {
            id: 'magic:theory',
            group: 'magic.doctrine',
            source: 'authored:resident',
            text: residentDialogue('npc_scholar_1', 'Арен').text,
        },
        ...WORLD_LOCATION_DEFINITIONS.map((location) => ({
            id: `location:${location.id}`,
            group: 'world.geography',
            source: 'authored:world',
            locationId: location.id,
            text: `${location.name}, ${REGION_NAME}. ${regionDirection(location)} относительно Новогорода. Опасность ${String(location.dangerLevel)}.`,
        })),
        ...homeCityKnowledge(actor, navigation),
    ]
    const profile = companionProfiles[actor.id]
    if (profile !== undefined) {
        entries.push({
            id: `person:${actor.id}`,
            group: 'world.common',
            source: 'authored:profile',
            text: profile.greeting,
        })
    }
    if (actor.tags.has('cleric')) {
        entries.push({
            id: `person:${actor.id}:doctrine`,
            group: 'prayer.doctrine',
            source: 'authored:resident',
            text: residentDialogue(actor.id, actor.nickname).text,
        })
    }
    entries.push(...discoveredKnowledge(actor))
    return entries.filter(
        (entry) =>
            groups.has(entry.group) || entry.group === 'personal.discovered'
    )
}
function direction(dx: number, dy: number): string {
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        return 'Здесь'
    }
    return [
        Math.abs(dy) < Math.abs(dx) / 2 ? '' : dy < 0 ? 'К северу' : 'К югу',
        Math.abs(dx) < Math.abs(dy) / 2
            ? ''
            : dx < 0
              ? 'к западу'
              : 'к востоку',
    ]
        .filter(Boolean)
        .join(' и ')
}
function discoveredKnowledge(actor: GameCharacter): KnowledgeEntry[] {
    const entries: KnowledgeEntry[] = []
    prepareConstellationLayout(actor)
    for (const node of snapshotConstellations(actor).nodes) {
        if (
            !node.unlocked ||
            node.name === undefined ||
            node.description === undefined
        ) {
            continue
        }
        entries.push({
            id: `own-star:${actor.id}:${node.id}`,
            group: 'personal.discovered',
            source: 'authoritative:own-discovered-star',
            text: `Я сама изучила звезду «${node.name}»: ${node.description}`,
        })
    }
    return entries
}

function addScholarKnowledge(actor: GameCharacter, groups: Set<string>): void {
    if (actor.tags.has('scholar')) {
        groups.add('magic.doctrine')
    }
}

function regionDirection(
    location: (typeof WORLD_LOCATION_DEFINITIONS)[number]
): string {
    const center = getWorldLocationDefinition(CENTER_LOCATION_ID)
    return center === undefined
        ? 'Известное место'
        : direction(location.column - center.column, location.row - center.row)
}
export function landmarkText(
    entry: KnowledgeEntry,
    actor: GameCharacter,
    navigation: NavigationService
): string {
    if (entry.locationId !== actor.locationId) {
        return entry.text
    }
    const building = (navigation.grid.buildings ?? []).find(
        (candidate) => candidate.id === entry.buildingId
    )
    return building === undefined
        ? entry.text
        : `${entry.text} ${direction(building.entry.x - actor.position.x, building.entry.y - actor.position.y)} от текущего места.`
}

const cityLandmarks = new WeakMap<NavigationService, KnowledgeEntry[]>()
const retainedHomeKnowledge = new WeakMap<GameCharacter, KnowledgeEntry[]>()
function homeCityKnowledge(
    actor: GameCharacter,
    navigation: NavigationService
): KnowledgeEntry[] {
    const home = actor.spawnLocationId
    if (getWorldLocationDefinition(home)?.biome !== 'city') {
        return []
    }
    if (actor.locationId === home && !cityLandmarks.has(navigation)) {
        const buildings = navigation.grid.buildings ?? []
        const name = getWorldLocationDefinition(home)?.name ?? home
        const landmarks: KnowledgeEntry[] = buildings.map((building) => ({
            id: `building:${home}:${building.id}`,
            group: 'city.local',
            source: 'authored:map',
            buildingId: building.id,
            locationId: home,
            text: `${building.name}, ${name}. Используй настоящий вход здания.`,
        }))
        if (home === CENTER_LOCATION_ID) {
            landmarks.push(
                ...serviceHomeKnowledge(navigation, home, name, buildings)
            )
        }
        cityLandmarks.set(navigation, landmarks)
    }
    if (actor.locationId === home) {
        retainedHomeKnowledge.set(actor, cityLandmarks.get(navigation) ?? [])
    }
    return structuredClone(retainedHomeKnowledge.get(actor) ?? [])
}

function serviceHomeKnowledge(
    navigation: NavigationService,
    home: string,
    name: string,
    buildings: readonly MapBuildingDefinition[]
): KnowledgeEntry[] {
    return supportNpcHomeDefinitions().map((profile) => {
        const point = navigation.tileToWorld(profile.tile)
        const building = buildings.find((candidate) =>
            containsBuildingPoint(candidate.bounds, point)
        )
        return {
            id: `service-home:${profile.id}`,
            group: 'city.local',
            source: 'authored:npc-home',
            locationId: home,
            ...(building === undefined ? {} : { buildingId: building.id }),
            text: `${profile.name} — житель ${name}${building === undefined ? '' : `, обычно в здании «${building.name}»`}. Это известное место службы, не проверенное текущее положение.`,
        }
    })
}

export function prepareKnowledgeCatalog(
    room: Pick<
        import('../game/room').GameRoom,
        'getCharacter' | 'navigationFor'
    >,
    actorIds: readonly string[]
): void {
    for (const id of actorIds) {
        const actor = room.getCharacter(id)
        if (actor !== undefined) {
            characterKnowledge(actor, room.navigationFor(actor))
        }
    }
}
