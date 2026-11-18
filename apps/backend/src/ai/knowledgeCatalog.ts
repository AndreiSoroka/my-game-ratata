import {
    CENTER_LOCATION_ID,
    getWorldLocationDefinition,
    REGION_NAME,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { companionProfiles } from '../game/companionProfiles'
import { snapshotConstellations } from '../game/constellationSnapshot'
import type { NavigationService } from '../game/navigation'
import { prepareConstellationLayout } from '../game/personalConstellationSky'
import {
    characterKnowledgeAudiences,
    hasKnowledgeAudience,
} from './knowledgeAudiences'
import { homeCityKnowledge } from './knowledgeCity'
import { type KnowledgeArticle, knowledgeCorpus } from './knowledgeCorpus'

export interface KnowledgeEntry {
    id: string
    group: string
    text: string
    source: string
    locationId?: string
    buildingId?: string
    landmarkId?: string
    aliases?: readonly string[]
    extends?: string
}
export interface CharacterKnowledgeContext {
    residentExists?: (id: string) => boolean
}
/** Knowledge grants describe learned information, never controller privileges or powers. */
export function characterKnowledge(
    actor: GameCharacter,
    navigation: NavigationService,
    context: CharacterKnowledgeContext = {}
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
        ...homeCityKnowledge(actor, navigation, context),
    ]
    const profile = companionProfiles[actor.id]
    if (profile !== undefined && actor.npcIdentityProfile === undefined) {
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
export function knowledgeDirection(dx: number, dy: number): string {
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
        : knowledgeDirection(
              location.column - center.column,
              location.row - center.row
          )
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
    const point =
        building?.entry ??
        navigation.grid.landmarks?.find(
            (candidate) => candidate.id === entry.landmarkId
        )?.position
    return point === undefined
        ? entry.text
        : `${entry.text} ${knowledgeDirection(point.x - actor.position.x, point.y - actor.position.y)} от текущего места.`
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
            characterKnowledge(
                actor,
                room.navigationFor(actor),
                roomKnowledgeContext(room)
            )
        }
    }
}

export function roomKnowledgeContext(
    room: Pick<import('../game/room').GameRoom, 'getCharacter'>
): CharacterKnowledgeContext {
    return { residentExists: (id) => room.getCharacter(id) !== undefined }
}
