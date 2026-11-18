import {
    CENTER_LOCATION_ID,
    getWorldLocationDefinition,
    ITEM_DEFINITIONS,
    WORKSHOP_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import {
    containsBuildingPoint,
    type MapBuildingDefinition,
} from '../game/mapBuildings'
import type { NavigationService } from '../game/navigation'
import { supportNpcHomeDefinitions } from '../game/supportNpcs'
import { knowledgeResidenceIds } from './knowledgeAudiences'
import type {
    CharacterKnowledgeContext,
    KnowledgeEntry,
} from './knowledgeCatalog'

const cityLandmarks = new WeakMap<NavigationService, KnowledgeEntry[]>()
const retainedHomeKnowledge = new WeakMap<GameCharacter, KnowledgeEntry[]>()
export function homeCityKnowledge(
    actor: GameCharacter,
    navigation: NavigationService,
    context: CharacterKnowledgeContext
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
        cityLandmarks.set(navigation, mapLandmarkKnowledge(navigation, home))
    }
    retainedHomeKnowledge.set(actor, [
        ...retainedHomeEntries(actor, homes).filter(
            (entry) => entry.locationId !== home
        ),
        ...(cityLandmarks.get(navigation) ?? []),
        ...(home === CENTER_LOCATION_ID
            ? serviceHomeKnowledge(
                  navigation,
                  home,
                  getWorldLocationDefinition(home)?.name ?? home,
                  navigation.grid.buildings ?? [],
                  context
              )
            : []),
    ])
    return structuredClone(retainedHomeKnowledge.get(actor) ?? [])
}

function mapLandmarkKnowledge(
    navigation: NavigationService,
    home: string
): KnowledgeEntry[] {
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
    landmarks.push(
        ...(navigation.grid.landmarks ?? [])
            .filter((landmark) => landmark.kind === 'gate')
            .map((landmark) => ({
                id: `landmark:${home}:${landmark.id}`,
                group: 'city.local',
                source: 'authored:map',
                landmarkId: landmark.id,
                locationId: home,
                text: `${landmark.name}, ${name}. Через эти ворота дорога ведёт в ${getWorldLocationDefinition(landmark.destinationLocationId ?? '')?.name ?? 'соседние земли'}.`,
                aliases: [landmark.name, 'городские ворота', 'выход из города'],
            }))
    )
    return landmarks
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
    buildings: readonly MapBuildingDefinition[],
    context: CharacterKnowledgeContext
): KnowledgeEntry[] {
    return supportNpcHomeDefinitions(navigation).flatMap((profile) => {
        if (
            profile.requiresCityState !== undefined &&
            context.residentExists?.(profile.id) !== true
        ) {
            return []
        }
        const point = profile.position ?? navigation.tileToWorld(profile.tile)
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
