import {
    type GameLocale,
    getWorldLocationDefinition,
    type QuestDraft,
    type Vector2,
    WORLD_LOCATION_ENGLISH_NAMES,
    worldSignMessages,
    worldSignPresentation,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { containsBuildingPoint } from './mapBuildings'
import type { NavigationService } from './navigation'
import type { QuestValidationEnvironment } from './npcQuestValidation'

export const MIN_QUEST_EXCURSION_TILES = 16

/** Measure the shortest real route to a usable speaking position, in map tiles. */
export function inquiryPathTiles(
    actor: GameCharacter,
    target: GameCharacter,
    navigation: NavigationService
): number | undefined {
    const { tileWidth, tileHeight } = navigation.grid
    const center = navigation.worldToTile(target.position)
    let best = Infinity
    for (
        let y = -Math.ceil(48 / tileHeight);
        y <= Math.ceil(48 / tileHeight);
        y++
    ) {
        for (
            let x = -Math.ceil(48 / tileWidth);
            x <= Math.ceil(48 / tileWidth);
            x++
        ) {
            const tile = { x: center.x + x, y: center.y + y }
            if (navigation.isSolidTile(tile)) {
                continue
            }
            const point = navigation.tileToWorld(tile)
            if (
                Math.hypot(
                    point.x - target.position.x,
                    point.y - target.position.y
                ) > 48 ||
                !navigation.hasLineOfSight(point, target.position)
            ) {
                continue
            }
            const path = navigation.findPathWorld(actor.position, point)
            if (path.length === 0) {
                continue
            }
            let previous = actor.position,
                length = 0
            for (const step of path) {
                length += Math.hypot(
                    (step.x - previous.x) / tileWidth,
                    (step.y - previous.y) / tileHeight
                )
                previous = step
            }
            best = Math.min(best, length)
        }
    }
    return Number.isFinite(best) ? best : undefined
}

export function validateQuestExcursion(
    actor: GameCharacter,
    draft: QuestDraft,
    environment: QuestValidationEnvironment
): string | null {
    for (const objective of draft.objectives) {
        if (objective.kind !== 'inspect') {
            continue
        }
        const target = environment.getCharacter(objective.targetId)
        if (
            target?.alive !== true ||
            !target.soul.canSpeak ||
            target.id === actor.id
        ) {
            return 'Собеседник для поручения недоступен.'
        }
        if (actor.locationId !== target.locationId) {
            continue
        }
        const tiles = inquiryPathTiles(
            actor,
            target,
            environment.navigationFor(actor)
        )
        if (tiles === undefined) {
            return 'К собеседнику по поручению нет доступного пути.'
        }
        if (tiles + 1e-6 < MIN_QUEST_EXCURSION_TILES) {
            return 'Для такого поручения нужен путь не короче 16 клеток. Вы уже слишком близко к цели.'
        }
    }
    return null
}

export function namedQuestPlace(
    locationId: string,
    point: Vector2 | undefined,
    environment: QuestValidationEnvironment,
    locale: GameLocale = 'ru'
): string {
    const location =
        (locale === 'en'
            ? WORLD_LOCATION_ENGLISH_NAMES[locationId]
            : undefined) ??
        getWorldLocationDefinition(locationId)?.name ??
        locationId
    return point === undefined
        ? location
        : questLandmark(locationId, point, environment, locale, location)
}

function questLandmark(
    locationId: string,
    point: Vector2,
    environment: QuestValidationEnvironment,
    locale: GameLocale,
    location: string
): string {
    const buildings =
        environment.navigationFor({ locationId }).grid.buildings ?? []
    const building =
        buildings.find((entry) => containsBuildingPoint(entry.bounds, point)) ??
        buildings.find(
            (entry) =>
                Math.hypot(entry.entry.x - point.x, entry.entry.y - point.y) <=
                48
        )
    if (building === undefined) {
        return location
    }
    const sign = worldSignPresentation(locationId, building.name)
    const translated =
        locale === 'en' && sign !== undefined
            ? worldSignMessages[sign.nameMessage.key]?.[1]
            : undefined
    return `${translated ?? building.name}, ${location}`
}

const questDirections = {
    nearby: { ru: 'рядом', en: 'nearby' },
    east: { ru: 'к востоку', en: 'east' },
    west: { ru: 'к западу', en: 'west' },
    south: { ru: 'к югу', en: 'south' },
    north: { ru: 'к северу', en: 'north' },
    southeast: { ru: 'к юго-востоку', en: 'southeast' },
    southwest: { ru: 'к юго-западу', en: 'southwest' },
    northeast: { ru: 'к северо-востоку', en: 'northeast' },
    northwest: { ru: 'к северо-западу', en: 'northwest' },
}

export function questCompass(
    from: Vector2,
    to: Vector2,
    locale: GameLocale = 'ru'
): string {
    return questDirections[questDirection(from, to)][locale]
}

function questDirection(
    from: Vector2,
    to: Vector2
): keyof typeof questDirections {
    const dx = to.x - from.x,
        dy = to.y - from.y
    if (Math.hypot(dx, dy) < 32) {
        return 'nearby'
    }
    if (Math.abs(dx) > Math.abs(dy) * 2) {
        return dx > 0 ? 'east' : 'west'
    }
    if (Math.abs(dy) > Math.abs(dx) * 2) {
        return dy > 0 ? 'south' : 'north'
    }
    return dy > 0
        ? dx > 0
            ? 'southeast'
            : 'southwest'
        : dx > 0
          ? 'northeast'
          : 'northwest'
}
