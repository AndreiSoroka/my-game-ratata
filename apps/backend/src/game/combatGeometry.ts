import {
    type AttackAbilityId,
    type AttackZone,
    SHOT_HALF_WIDTH,
    SPARK_HALF_WIDTH,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { effectiveAbility } from './effectiveParameters'

export function buildAttackZones(
    actor: Pick<GameCharacter, 'config' | 'position' | 'facing' | 'id'>,
    tileSize: number
): AttackZone[] {
    return actor.config.attackZones.map((zone) => {
        const rotated = rotateZone(zone, actor.facing)
        const minX = actor.position.x + rotated.minX * tileSize
        const minY = actor.position.y + rotated.minY * tileSize
        const maxX = actor.position.x + rotated.maxX * tileSize
        const maxY = actor.position.y + rotated.maxY * tileSize

        return {
            maxX: Math.max(minX, maxX),
            maxY: Math.max(minY, maxY),
            minX: Math.min(minX, maxX),
            minY: Math.min(minY, maxY),
            ownerId: actor.id,
        }
    })
}

function rotateZone(
    zone: Omit<AttackZone, 'ownerId'>,
    facing: GameCharacter['facing']
): Omit<AttackZone, 'ownerId'> {
    const points = [
        rotatePoint(zone.minX, zone.minY, facing),
        rotatePoint(zone.minX, zone.maxY, facing),
        rotatePoint(zone.maxX, zone.minY, facing),
        rotatePoint(zone.maxX, zone.maxY, facing),
    ]

    return {
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
    }
}

function rotatePoint(
    x: number,
    y: number,
    facing: GameCharacter['facing']
): { x: number; y: number } {
    switch (facing) {
        case 'up':
            return { x, y: -y }
        case 'left':
            return { x: -y, y: x }
        case 'right':
            return { x: y, y: -x }
        case 'down':
            return { x, y }
    }
}

export function isInZones(
    target: { position: Vector2 },
    zones: AttackZone[]
): boolean {
    return zones.some(
        (zone) =>
            target.position.x >= zone.minX &&
            target.position.x <= zone.maxX &&
            target.position.y >= zone.minY &&
            target.position.y <= zone.maxY
    )
}

export function buildAbilityAttackZones(
    actor: GameCharacter,
    id: AttackAbilityId,
    tileWidth = 0
): AttackZone[] {
    const range = effectiveAbility(actor, id, tileWidth).range
    const width = id === 'shot' ? SHOT_HALF_WIDTH : SPARK_HALF_WIDTH
    return forwardAttackZones(actor, range, width)
}

export function forwardAttackZones(
    actor: Pick<GameCharacter, 'id' | 'position' | 'facing'>,
    range: number,
    width: number
): AttackZone[] {
    const rotated = rotateZone(
        { minX: -width, maxX: width, minY: 0, maxY: range },
        actor.facing
    )
    return [
        {
            ownerId: actor.id,
            minX: actor.position.x + rotated.minX,
            maxX: actor.position.x + rotated.maxX,
            minY: actor.position.y + rotated.minY,
            maxY: actor.position.y + rotated.maxY,
        },
    ]
}

/** Inclusive exact contact geometry. A square proxy is never used for a sector or circle. */
export function isInAttackGeometry(
    point: Vector2,
    geometry: import('@my-game-ratata/contracts').AttackGeometry
): boolean {
    if (geometry.kind === 'rectangles') {
        return isInZones({ position: point }, geometry.zones)
    }
    const dx = point.x - geometry.center.x,
        dy = point.y - geometry.center.y
    const length = Math.hypot(dx, dy)
    if (length > geometry.radius + 1e-8) {
        return false
    }
    if (geometry.kind === 'circle' || length < 1e-8) {
        return true
    }
    const dot = (dx * geometry.direction.x + dy * geometry.direction.y) / length
    return dot + 1e-8 >= Math.cos((geometry.angleDegrees * Math.PI) / 360)
}
