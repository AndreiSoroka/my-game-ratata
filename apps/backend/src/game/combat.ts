import type { AttackZone, GameEventPayload } from '@my-game-ratata/contracts'

import { type GameCharacter } from './character'
import { resolveCharacterStats } from './characterStats'
import { canTargetByFaction } from './factions'
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

const exhaustedAttackDamageMultiplier = 1 / 3
const exhaustedAttackDurationMultiplier = 2

export function attemptAttack(context: AttackContext): GameEventPayload[] {
    const { actor, now } = context

    if (!canAttack(actor, now)) {
        return []
    }

    const resourceSpend = actor.spendAttackResources()
    const durationMultiplier = resourceSpend.fullyPowered
        ? 1
        : exhaustedAttackDurationMultiplier
    const damageMultiplier = resourceSpend.fullyPowered
        ? 1
        : exhaustedAttackDamageMultiplier
    const lockMs = actor.config.combat.attackLockMs * durationMultiplier
    const windupMs = actor.config.combat.attackWindupMs * durationMultiplier

    actor.lastAttackAt = now
    actor.lockAction(now, lockMs)
    actor.queueAttackHit(now, {
        canStun: resourceSpend.canStun,
        damageMultiplier,
        targetEnergyDrain: targetEnergyDrainFor(actor),
        windupMs,
    })
    actor.setAnimation('attack', now, lockMs)
    actor.attackZones = buildAttackZones(actor, context.tileSize)
    actor.attackZoneUntil = now + lockMs

    return [{ actorId: actor.id, kind: 'attack' }]
}

export function resolvePendingAttackHit(
    context: AttackContext
): GameEventPayload[] {
    const { actor, now } = context

    const attack = actor.consumePendingAttackHit(now)

    if (attack === undefined) {
        return []
    }

    if (!actor.alive || actor.stunUntil > now) {
        return []
    }

    const events: GameEventPayload[] = []
    const target = findNearestHit(actor, context.targets)

    if (target === undefined) {
        return events
    }

    const damage = rollDamage(actor, attack.damageMultiplier)
    target.applyDamage(damage, now)
    target.drainEnergy(attack.targetEnergyDrain)
    maybeApplyStun(actor, target, now, attack.canStun)
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

    if (actor.isActionLocked(now)) {
        return false
    }

    if (now - actor.lastAttackAt < actor.config.combat.attackCooldownMs) {
        return false
    }

    return true
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
        .filter((target) => canTargetByFaction(actor, target))
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

function rollDamage(actor: GameCharacter, multiplier = 1): number {
    const stats = resolveCharacterStats(actor.config, actor.equipment)
    const low = Math.min(stats.minDamage, stats.maxDamage)
    const high = Math.max(stats.minDamage, stats.maxDamage)
    let damage = Math.floor(low + Math.random() * (high - low + 1))

    if (Math.random() < stats.critChance) {
        damage = Math.round(damage * actor.config.combat.critMultiplier)
    }

    return Math.max(1, Math.round(damage * multiplier))
}

function maybeApplyStun(
    actor: GameCharacter,
    target: GameCharacter,
    now: number,
    canStun: boolean
): void {
    if (!canStun) {
        return
    }

    const { combat } = actor.config

    if (Math.random() >= combat.stunChance) {
        return
    }

    const low = Math.min(combat.stunMinDurationMs, combat.stunMaxDurationMs)
    const high = Math.max(combat.stunMinDurationMs, combat.stunMaxDurationMs)
    const duration = Math.floor(low + Math.random() * (high - low + 1))

    target.stunUntil = Math.max(target.stunUntil, now + duration)
}

function targetEnergyDrainFor(actor: GameCharacter): number {
    return Math.ceil(actor.config.resources.attackEnergyCost / 2)
}
