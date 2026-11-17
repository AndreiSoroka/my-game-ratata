import {
    CENTER_LOCATION_ID,
    getWorldLocationDefinition,
    ITEM_DEFINITIONS,
    REGION_NAME,
    WORKSHOP_DEFINITIONS,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { companionProfiles } from '../game/companionProfiles'
import { snapshotConstellations } from '../game/constellationSnapshot'
import {
    containsBuildingPoint,
    type MapBuildingDefinition,
} from '../game/mapBuildings'
import type { NavigationService } from '../game/navigation'
import { prepareConstellationLayout } from '../game/personalConstellationSky'
import { supportNpcHomeDefinitions } from '../game/supportNpcs'
import {
    characterKnowledgeAudiences,
    hasKnowledgeAudience,
    knowledgeResidenceIds,
} from './knowledgeAudiences'
import { type KnowledgeArticle, knowledgeCorpus } from './knowledgeCorpus'

export interface KnowledgeEntry {
    id: string
    group: string
    text: string
    source: string
    locationId?: string
    buildingId?: string
    aliases?: readonly string[]
    extends?: string
}
/** Knowledge grants describe learned information, never controller privileges or powers. */
export function characterKnowledge(
    actor: GameCharacter,
    navigation: NavigationService
): KnowledgeEntry[] {
    const audiences = characterKnowledgeAudiences(actor)
    const entries: KnowledgeEntry[] = [
        ...knowledgeCorpus()
            .filter((article) =>
                hasKnowledgeAudience(audiences, article.audiences)
            )
            .map(articleEntry),
        {
            id: 'world:region',
            group: 'world.common',
            source: 'authored:world',
            text: `${REGION_NAME}. Между соседними местами проходят на север, юг, запад или восток через окраины.`,
        },
        ...WORLD_LOCATION_DEFINITIONS.map((location) => ({
            id: `location:${location.id}`,
            group: 'world.geography',
            source: 'authored:world',
            locationId: location.id,
            text: `${location.name}, ${REGION_NAME}. ${regionDirection(location)} относительно Новогорода. ${location.dangerLevel === 0 ? 'Город под защитой.' : location.dangerLevel < 3 ? 'За городскими стенами встречаются опасные существа.' : 'Далёкие земли особенно опасны.'}`,
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
    entries.push(...discoveredKnowledge(actor))
    return entries
}

function articleEntry(article: KnowledgeArticle): KnowledgeEntry {
    const atoms = article.audiences.flatMap((clause) =>
        typeof clause === 'string' ? [clause] : [...clause]
    )
    const group = atoms.some((atom) => atom.startsWith('resident:'))
        ? 'city.local'
        : atoms.includes('doctrine:prayer')
          ? 'prayer.doctrine'
          : atoms.includes('doctrine:magic')
            ? 'magic.doctrine'
            : atoms.includes('common')
              ? 'world.common'
              : (atoms[0]?.replace(':', '.') ?? 'world.common')
    return {
        id: article.id,
        group,
        text: article.text,
        source: `authored:knowledge:${article.id}`,
        ...(article.aliases.length === 0 ? {} : { aliases: article.aliases }),
        ...(article.extends === undefined ? {} : { extends: article.extends }),
    }
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
    const homes = knowledgeResidenceIds(actor).filter(
        (id) => getWorldLocationDefinition(id)?.biome === 'city'
    )
    if (homes.length === 0) {
        retainedHomeKnowledge.delete(actor)
        return []
    }
    const home = homes.find((id) => id === actor.locationId)
    if (home === undefined) {
        return structuredClone(retainedHomeEntries(actor, homes))
    }
    if (!cityLandmarks.has(navigation)) {
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
    retainedHomeKnowledge.set(actor, [
        ...retainedHomeEntries(actor, homes).filter(
            (entry) => entry.locationId !== home
        ),
        ...(cityLandmarks.get(navigation) ?? []),
    ])
    return structuredClone(retainedHomeKnowledge.get(actor) ?? [])
}

function retainedHomeEntries(
    actor: GameCharacter,
    homes: readonly string[]
): KnowledgeEntry[] {
    return (retainedHomeKnowledge.get(actor) ?? []).filter(
        (entry) =>
            entry.locationId !== undefined && homes.includes(entry.locationId)
    )
}

function serviceHomeKnowledge(
    navigation: NavigationService,
    home: string,
    name: string,
    buildings: readonly MapBuildingDefinition[]
): KnowledgeEntry[] {
    return supportNpcHomeDefinitions().flatMap((profile) => {
        const point = navigation.tileToWorld(profile.tile)
        const building = buildings.find((candidate) =>
            containsBuildingPoint(candidate.bounds, point)
        )
        const homeEntry: KnowledgeEntry = {
            id: `service-home:${profile.id}`,
            group: 'city.local',
            source: 'authored:npc-home',
            locationId: home,
            ...(building === undefined ? {} : { buildingId: building.id }),
            text: `${profile.name} — житель ${name}${building === undefined ? '' : `, обычно в здании «${building.name}»`}. Это известное место службы, не проверенное текущее положение.`,
        }
        const workshop = WORKSHOP_DEFINITIONS.find(
            ({ npcId }) => npcId === profile.id
        )
        return workshop === undefined
            ? [homeEntry]
            : [
                  homeEntry,
                  {
                      id: `service-catalog:${profile.id}`,
                      group: 'city.local',
                      source: 'authored:workshop',
                      locationId: home,
                      ...(building === undefined
                          ? {}
                          : { buildingId: building.id }),
                      text: `${profile.name} изготавливает и продаёт: ${workshop.items.map((itemId) => ITEM_DEFINITIONS[itemId].name).join(', ')}. Отсутствующее изделие можно заказать.${workshop.repair ? ' Здесь также чинят снаряжение.' : ''} Наличие товара и цену нужно узнавать у мастера.`,
                  },
              ]
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
