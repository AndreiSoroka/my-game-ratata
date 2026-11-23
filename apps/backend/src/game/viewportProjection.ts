import {
    type AttackGeometry,
    type CharacterSnapshot,
    type SetViewportClientMessage,
    snapshotPrayerParameters,
    type Vector2,
    type ViewportBounds,
    type WorldObjectBounds,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { viewportFootsteps } from './viewportFootsteps'

const prefetchRatio = 0.15
const spriteMargin = 32

/** Reduce an already authorized view; this never queries or reveals new world state. */
export function projectViewport(
    snapshot: WorldSnapshot,
    hint: SetViewportClientMessage | undefined,
    playerId: string | undefined
): WorldSnapshot {
    if (hint === undefined || snapshot.location?.id !== hint.locationId) {
        return snapshot
    }
    const bounds = expandedBounds(hint.bounds)
    const visible = (entry: SpatialEntry) => spatialIntersects(entry, bounds)
    const result: WorldSnapshot = {
        ...snapshot,
        viewBounds: bounds,
        characters: snapshot.characters.filter(
            (character) =>
                character.id === playerId ||
                characterIntersects(character, bounds)
        ),
        items: snapshot.items.filter(visible),
        chests: snapshot.chests.filter(visible),
    }
    const footsteps = viewportFootsteps(
        snapshot.characters,
        result.characters,
        playerId
    )
    if (footsteps.length > 0) {
        result.footstepSources = footsteps
    } else {
        delete result.footstepSources
    }
    if (snapshot.graves !== undefined) {
        result.graves = snapshot.graves.filter(visible)
    }
    if (snapshot.portals !== undefined) {
        result.portals = snapshot.portals.filter(visible)
    }
    if (snapshot.magicEffects !== undefined) {
        result.magicEffects = snapshot.magicEffects.filter((effect) =>
            circleIntersects(
                'center' in effect ? effect.center : effect.position,
                effect.radius,
                bounds
            )
        )
    }
    if (snapshot.adventure !== undefined) {
        result.adventure = {
            ...snapshot.adventure,
            resourceNodes: snapshot.adventure.resourceNodes.filter(visible),
            farmPlots: snapshot.adventure.farmPlots.filter(visible),
            ...(snapshot.adventure.worldObjects === undefined
                ? {}
                : {
                      worldObjects:
                          snapshot.adventure.worldObjects.filter(visible),
                  }),
        }
    }
    return result
}

interface SpatialEntry {
    position: Vector2
    bounds?: WorldObjectBounds
    collisionBounds?: WorldObjectBounds
    matureBounds?: WorldObjectBounds
}

function expandedBounds(bounds: ViewportBounds): ViewportBounds {
    const x = (bounds.right - bounds.left) * prefetchRatio
    const y = (bounds.bottom - bounds.top) * prefetchRatio
    return {
        left: bounds.left - x,
        top: bounds.top - y,
        right: bounds.right + x,
        bottom: bounds.bottom + y,
    }
}

function spatialIntersects(
    entry: SpatialEntry,
    bounds: ViewportBounds
): boolean {
    return (
        circleIntersects(entry.position, spriteMargin, bounds) ||
        [entry.bounds, entry.collisionBounds, entry.matureBounds].some(
            (area) => area !== undefined && rectangleIntersects(area, bounds)
        )
    )
}

function rectangleIntersects(
    area: WorldObjectBounds,
    bounds: ViewportBounds
): boolean {
    return (
        area.x <= bounds.right &&
        area.x + area.width >= bounds.left &&
        area.y <= bounds.bottom &&
        area.y + area.height >= bounds.top
    )
}

function circleIntersects(
    center: Vector2,
    radius: number,
    bounds: ViewportBounds
): boolean {
    const x = Math.max(bounds.left, Math.min(center.x, bounds.right))
    const y = Math.max(bounds.top, Math.min(center.y, bounds.bottom))
    return Math.hypot(center.x - x, center.y - y) <= radius
}

function characterIntersects(
    character: CharacterSnapshot,
    bounds: ViewportBounds
): boolean {
    let radius = Math.max(
        spriteMargin,
        character.abilities?.magicChannel?.radius ?? 0
    )
    radius = Math.max(radius, prayerRadius(character))
    if (circleIntersects(character.position, radius, bounds)) {
        return true
    }
    const geometry = character.combat?.action?.geometry
    return geometry !== undefined && geometryIntersects(geometry, bounds)
}

function geometryIntersects(
    geometry: AttackGeometry,
    bounds: ViewportBounds
): boolean {
    if (geometry.kind === 'rectangles') {
        return geometry.zones.some((zone) =>
            rectangleIntersects(
                {
                    x: zone.minX,
                    y: zone.minY,
                    width: zone.maxX - zone.minX,
                    height: zone.maxY - zone.minY,
                },
                bounds
            )
        )
    }
    return circleIntersects(geometry.center, geometry.radius, bounds)
}

function prayerRadius(character: CharacterSnapshot): number {
    const cast = character.abilities?.casting
    if (cast === undefined || cast === null) {
        return 0
    }
    const parameters = snapshotPrayerParameters(character, cast.abilityId)
    return cast.radius ?? parameters.energyRecoveryRadius ?? parameters.radius
}
