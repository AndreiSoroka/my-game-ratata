import type {
    AttackGeometry,
    GameEventPayload,
    Vector2,
} from '@my-game-ratata/contracts'

import { abilityNotice } from './abilityContext'
import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import type { AttackContext } from './combat'
import { resolveRawAttackDamage } from './combatDamage'
import { isInAttackGeometry } from './combatGeometry'
import { arrowReleasePath } from './combatProjectileRelease'
import { clamp } from './math'
import type { NavigationService } from './navigation'
import { firstSolidImpact } from './tileRay'

export function pendingWallContact(
    { actor, navigation, secrets }: AttackContext,
    attack: PendingAttackHit,
    geometry: AttackGeometry,
    contact: { position: Vector2 } | undefined,
    area: boolean
): string | undefined {
    const wall = secrets?.closedWall
    if (wall === undefined || navigation === undefined) {
        return undefined
    }
    const spark = attack.sparkPath
    const path =
        spark === undefined
            ? arrowReleasePath(actor, attack, contact)
            : { origin: spark.origin, aim: contact?.position ?? spark.endpoint }
    const hit =
        path === undefined
            ? (contact === undefined || area) &&
              touchesWall(navigation, actor.position, wall.position, geometry)
            : firstWallHit(navigation, path.origin, path.aim, wall.position)
    return hit ? wall.id : undefined
}

export function resolveWallContact(
    context: AttackContext,
    attack: PendingAttackHit,
    wallId: string | undefined
): { impact: number; events: GameEventPayload[] } {
    if (wallId === undefined || context.secrets === undefined) {
        return { impact: 0, events: [] }
    }
    const { actor, random = Math.random, now } = context
    const { amount } = resolveRawAttackDamage(actor, attack, random, now)
    return context.secrets.damage(wallId, amount)
        ? { impact: amount, events: wallOpened(actor) }
        : { impact: 0, events: [] }
}

export function damageWallInArea(
    { navigation, secrets }: Pick<AttackContext, 'navigation' | 'secrets'>,
    actor: GameCharacter,
    center: Vector2,
    radius: number,
    amount: number
): GameEventPayload[] {
    const wall = secrets?.closedWall
    if (
        navigation === undefined ||
        secrets === undefined ||
        wall === undefined
    ) {
        return []
    }
    if (
        !touchesWall(navigation, center, wall.position, {
            kind: 'circle',
            center,
            radius,
        })
    ) {
        return []
    }
    return secrets.damage(wall.id, amount) ? wallOpened(actor) : []
}

function wallOpened(actor: GameCharacter): GameEventPayload[] {
    return abilityNotice(actor, 'Кладка подалась. Открылся проход.')
}

function firstWallHit(
    navigation: NavigationService,
    origin: Vector2,
    aim: Vector2,
    wall: Vector2
): boolean {
    const impact = firstSolidImpact(navigation.grid, origin, aim)
    const tile = navigation.worldToTile(wall)
    return impact?.tile.x === tile.x && impact.tile.y === tile.y
}

function touchesWall(
    navigation: NavigationService,
    origin: Vector2,
    wall: Vector2,
    geometry: AttackGeometry
): boolean {
    const tile = navigation.worldToTile(wall)
    const center = navigation.tileToWorld(tile)
    const halfWidth = navigation.grid.tileWidth / 2
    const halfHeight = navigation.grid.tileHeight / 2
    const geometryPoints =
        geometry.kind === 'rectangles'
            ? geometry.zones.flatMap(({ minX, minY, maxX, maxY }) => [
                  { x: minX, y: minY },
                  { x: maxX, y: maxY },
              ])
            : [geometry.center]
    return navigation.walkableNeighbors(tile).some((neighbor) => {
        const dx = neighbor.x - tile.x
        const dy = neighbor.y - tile.y
        const inset = 0.00001
        const minX = center.x - halfWidth + inset
        const maxX = center.x + halfWidth - inset
        const minY = center.y - halfHeight + inset
        const maxY = center.y + halfHeight - inset
        return [
            origin,
            center,
            ...geometryPoints,
            { x: minX, y: minY },
            { x: maxX, y: maxY },
        ].some((point) => {
            const face = {
                x:
                    dx === 0
                        ? clamp(point.x, minX, maxX)
                        : center.x + dx * (halfWidth + inset),
                y:
                    dy === 0
                        ? clamp(point.y, minY, maxY)
                        : center.y + dy * (halfHeight + inset),
            }
            return (
                isInAttackGeometry(face, geometry) &&
                firstSolidImpact(navigation.grid, origin, face) === undefined
            )
        })
    })
}
