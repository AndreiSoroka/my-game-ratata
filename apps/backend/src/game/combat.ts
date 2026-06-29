import type { AttackZone, GameEventPayload } from '@my-game-ratata/contracts'

import { type GameCharacter } from './character'
import { distance } from './math'

interface AttackContext {
    actor: GameCharacter
    now: number
    respawnDelayMsFor: (target: GameCharacter) => number
    targets: GameCharacter[]
    tileSize: number
}

interface HitCandidate {
    distance: number
    target: GameCharacter
}

export function attemptAttack(context: AttackContext): GameEventPayload[] {
    const { actor, now } = context

    if (!canAttack(actor, now)) {
        return []
    }

    actor.lastAttackAt = now
    actor.spendAttackResources()
    actor.setAnimation('attack', now, actor.config.combat.attackLockMs)
    actor.attackZones = buildAttackZones(actor, context.tileSize)
    actor.attackZoneUntil = now + actor.config.combat.attackLockMs

    const events: GameEventPayload[] = [{ actorId: actor.id, kind: 'attack' }]
    const target = findNearestHit(actor, context.targets)

    if (target === undefined) {
        return events
    }

    const damage = rollDamage(actor)
    target.applyDamage(damage, now)
    maybeApplyStun(actor, target, now)
    events.push({
        actorId: actor.id,
        amount: damage,
        kind: 'damage',
        targetId: target.id,
    })

    if (!target.alive) {
        target.queueRespawn(now, context.respawnDelayMsFor(target))
        events.push({ actorId: actor.id, kind: 'death', targetId: target.id })
    }

    return events
}

function canAttack(actor: GameCharacter, now: number): boolean {
    if (!actor.alive || actor.stunUntil > now) {
        return false
    }

    if (now - actor.lastAttackAt < actor.config.combat.attackCooldownMs) {
        return false
    }

    return actor.canSpendAttackResources()
}

function buildAttackZones(
    actor: GameCharacter,
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

function findNearestHit(
    actor: GameCharacter,
    targets: GameCharacter[]
): GameCharacter | undefined {
    const candidates = targets
        .filter((target) => target.id !== actor.id && target.alive)
        .filter((target) => isInZones(target, actor.attackZones))
        .map<HitCandidate>((target) => ({
            distance: distance(actor.position, target.position),
            target,
        }))
        .sort((a, b) => a.distance - b.distance)

    return candidates[0]?.target
}

function isInZones(target: GameCharacter, zones: AttackZone[]): boolean {
    return zones.some(
        (zone) =>
            target.position.x >= zone.minX &&
            target.position.x <= zone.maxX &&
            target.position.y >= zone.minY &&
            target.position.y <= zone.maxY
    )
}

function rollDamage(actor: GameCharacter): number {
    const { combat } = actor.config
    const low = Math.min(combat.minDamage, combat.maxDamage)
    const high = Math.max(combat.minDamage, combat.maxDamage)
    const base = Math.floor(low + Math.random() * (high - low + 1))

    if (Math.random() < combat.critChance) {
        return Math.max(1, Math.round(base * combat.critMultiplier))
    }

    return base
}

function maybeApplyStun(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
): void {
    const { combat } = actor.config

    if (Math.random() >= combat.stunChance) {
        return
    }

    const low = Math.min(combat.stunMinDurationMs, combat.stunMaxDurationMs)
    const high = Math.max(combat.stunMinDurationMs, combat.stunMaxDurationMs)
    const duration = Math.floor(low + Math.random() * (high - low + 1))

    target.stunUntil = Math.max(target.stunUntil, now + duration)
}
