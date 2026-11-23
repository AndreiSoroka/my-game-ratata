import {
    CENTER_LOCATION_ID,
    getWorldLocationDefinition,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { NavigationService } from '../game/navigation'
import { regionalExit, regionalRoute } from '../game/regionalNavigation'
import type { GameRoom } from '../game/room'
import { resolveRouteDestination } from '../game/routeDestination'
import { knowledgeResidenceIds } from './knowledgeAudiences'
import { knowledgeDirection } from './knowledgeCatalog'
import { npcAiNavigationError } from './navigationPolicy'
import type { NpcAiRole } from './types'

export interface NpcGuideGoal {
    key: string
    kind: 'location' | 'building' | 'landmark'
    name: string
    locationId: string
    position?: Vector2
    interior?: Vector2
}
export interface NpcKnownPlace extends Omit<
    NpcGuideGoal,
    'position' | 'interior'
> {
    direction: string
}
const rememberedPlaces = new WeakMap<GameCharacter, Map<string, NpcGuideGoal>>()

function refreshPlaces(
    actor: GameCharacter,
    navigation: NavigationService
): Map<string, NpcGuideGoal> {
    const places =
        rememberedPlaces.get(actor) ?? new Map<string, NpcGuideGoal>()
    for (const building of navigation.grid.buildings ?? []) {
        const goal: NpcGuideGoal = {
            key: `building:${actor.locationId}:${building.id}`,
            kind: 'building',
            name: building.name,
            locationId: actor.locationId,
            position: { ...building.entry },
            interior: { ...building.interior },
        }
        places.set(goal.key, goal)
    }
    const local = knowledgeResidenceIds(actor).includes(actor.locationId)
    for (const landmark of navigation.grid.landmarks ?? []) {
        if (landmark.kind !== 'gate') {
            continue
        }
        const seen =
            Math.hypot(
                landmark.position.x - actor.position.x,
                landmark.position.y - actor.position.y
            ) <= 240 &&
            navigation.hasLineOfSight(actor.position, landmark.position)
        if (!local && !seen) {
            continue
        }
        const goal: NpcGuideGoal = {
            key: `landmark:${actor.locationId}:${landmark.id}`,
            kind: 'landmark',
            name: landmark.name,
            locationId: actor.locationId,
            position: { ...landmark.position },
        }
        places.set(goal.key, goal)
    }
    rememberedPlaces.set(actor, places)
    return places
}

/** Public geography and earned static places; no foreign character positions enter this menu. */
export function knownGuidePlaces(
    actor: GameCharacter,
    navigation: NavigationService
): NpcKnownPlace[] {
    const locations: NpcGuideGoal[] = WORLD_LOCATION_DEFINITIONS.map(
        ({ id, name }) => ({
            key: `location:${id}`,
            kind: 'location',
            name,
            locationId: id,
        })
    )
    return [...locations, ...refreshPlaces(actor, navigation).values()].map(
        (goal) => ({
            key: goal.key,
            kind: goal.kind,
            name: goal.name,
            locationId: goal.locationId,
            direction: placeDirection(goal, actor),
        })
    )
}

export function resolveNpcGuideGoal(
    room: Pick<GameRoom, 'navigationFor'>,
    actor: GameCharacter,
    targetKey: string
): NpcGuideGoal | undefined {
    const navigation = room.navigationFor(actor)
    const places = refreshPlaces(actor, navigation)
    const location = WORLD_LOCATION_DEFINITIONS.find(
        ({ id }) => `location:${id}` === targetKey
    )
    if (location !== undefined) {
        return {
            key: targetKey,
            kind: 'location',
            name: location.name,
            locationId: location.id,
        }
    }
    const legacy = navigation.grid.buildings?.find(
        ({ id }) => `building:${id}` === targetKey
    )
    return legacy === undefined
        ? places.get(targetKey)
        : {
              key: targetKey,
              kind: 'building',
              name: legacy.name,
              locationId: actor.locationId,
              position: { ...legacy.entry },
              interior: { ...legacy.interior },
          }
}

/** Preflight before accepting or promising a route; the model cannot grant itself a destination. */
export function npcGuideTargetError(
    room: Pick<GameRoom, 'navigationFor'>,
    actor: GameCharacter,
    role: NpcAiRole,
    targetKey: string
): string | undefined {
    const goal = resolveNpcGuideGoal(room, actor, targetKey)
    if (goal === undefined) {
        return 'Это место мне пока неизвестно.'
    }
    if (role === 'advisor') {
        return 'Я могу объяснить дорогу, но не берусь сопровождать.'
    }
    if (
        role === 'city_coordinator' &&
        (actor.locationId !== CENTER_LOCATION_ID ||
            goal.locationId !== actor.locationId)
    ) {
        return 'Я остаюсь в городе, но могу показать известное место внутри него.'
    }
    return guideRouteError(room, actor, goal)
}

export const knownGuideTargetError = npcGuideTargetError

export function npcSelfTravelTargetError(
    room: Pick<GameRoom, 'navigationFor'>,
    actor: GameCharacter,
    role: NpcAiRole,
    targetKey: string
): string | undefined {
    if (role !== 'companion') {
        return 'Самостоятельное путешествие недоступно этому персонажу.'
    }
    const goal = resolveNpcGuideGoal(room, actor, targetKey)
    if (goal === undefined) {
        return 'Это место мне пока неизвестно.'
    }
    return goal.locationId === actor.locationId
        ? npcSelfTravelLocalError(room, actor, goal)
        : guideRouteError(room, actor, goal)
}

export function npcSelfTravelLocalError(
    room: Pick<GameRoom, 'navigationFor'>,
    actor: GameCharacter,
    goal: NpcGuideGoal
): string | undefined {
    const entry = goal.position ?? actor.position
    const navigation = room.navigationFor(actor)
    if (
        !canReachExact(navigation, actor.position, entry) ||
        (goal.interior !== undefined &&
            !canReachExact(navigation, entry, goal.interior))
    ) {
        return 'Сейчас не удаётся найти проходимую дорогу к этому месту.'
    }
    return npcAiNavigationError(actor, entry, navigation)
}

function canReachExact(
    navigation: NavigationService,
    from: Vector2,
    to: Vector2
): boolean {
    return navigation.findPathWorld(from, to).length > 0
}

function guideRouteError(
    room: Pick<GameRoom, 'navigationFor'>,
    actor: GameCharacter,
    goal: NpcGuideGoal
): string | undefined {
    const navigation = room.navigationFor(actor)
    const route = regionalRoute(actor.locationId, goal.locationId)
    if (route === undefined) {
        return 'Дорога к этому месту неизвестна.'
    }
    const next = route[1]
    const reachable =
        next === undefined
            ? resolveRouteDestination(
                  actor.position,
                  goal.position ?? actor.position,
                  navigation
              ) !== undefined
            : regionalExit(
                  actor.position,
                  actor.locationId,
                  next,
                  navigation
              ) !== undefined
    return reachable
        ? undefined
        : 'Сейчас не удаётся найти проходимую дорогу к этому месту.'
}

function placeDirection(goal: NpcGuideGoal, actor: GameCharacter): string {
    if (goal.locationId === actor.locationId && goal.position !== undefined) {
        return knowledgeDirection(
            goal.position.x - actor.position.x,
            goal.position.y - actor.position.y
        )
    }
    const current = getWorldLocationDefinition(actor.locationId)
    const target = getWorldLocationDefinition(goal.locationId)
    return current === undefined || target === undefined
        ? 'Направление неизвестно'
        : knowledgeDirection(
              target.column - current.column,
              target.row - current.row
          )
}
