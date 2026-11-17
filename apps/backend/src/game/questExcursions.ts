import {
    getWorldLocationDefinition,
    type QuestDraft,
    type Vector2,
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
    environment: QuestValidationEnvironment
): string {
    const location = getWorldLocationDefinition(locationId)?.name ?? locationId
    if (point === undefined) {
        return location
    }
    const buildings =
        environment.navigationFor({ locationId }).grid.buildings ?? []
    const building =
        buildings.find((entry) => containsBuildingPoint(entry.bounds, point)) ??
        buildings.find(
            (entry) =>
                Math.hypot(entry.entry.x - point.x, entry.entry.y - point.y) <=
                48
        )
    return building !== undefined ? `${building.name}, ${location}` : location
}

export function questCompass(from: Vector2, to: Vector2): string {
    const dx = to.x - from.x,
        dy = to.y - from.y
    if (Math.hypot(dx, dy) < 32) {
        return 'рядом'
    }
    if (Math.abs(dx) > Math.abs(dy) * 2) {
        return dx > 0 ? 'к востоку' : 'к западу'
    }
    if (Math.abs(dy) > Math.abs(dx) * 2) {
        return dy > 0 ? 'к югу' : 'к северу'
    }
    return dy > 0
        ? dx > 0
            ? 'к юго-востоку'
            : 'к юго-западу'
        : dx > 0
          ? 'к северо-востоку'
          : 'к северо-западу'
}
