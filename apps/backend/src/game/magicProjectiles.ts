import {
    type GameEventPayload,
    type MagicEffectSnapshot,
    MASTERY_REWARDS,
    type SpellSkillId,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { resolveCharacterDamage } from './abilityDamage'
import type { GameCharacter } from './character'
import { availableToAttack } from './combat'
import { recordRunicContact } from './constellations'
import { damageGrave } from './graveCombat'
import { distance } from './math'
import {
    confirmCombatResourceSpend,
    confirmResourceSpend,
    type ResourceSpendReceipt,
} from './resourcePractice'
import { awardMasteries, type captureMasteryFactors } from './skillProgression'

export interface FireProjectile {
    id: string
    abilityId: SpellSkillId
    actor: GameCharacter
    launchedAt: number
    launched: boolean
    locationId: string
    direction: Vector2
    position: Vector2
    range: number
    traveled: number
    radius: number
    speed: number
    minDamage: number
    maxDamage: number
    resourceSpend: ResourceSpendReceipt | undefined
    random: () => number
    factors: ReturnType<typeof captureMasteryFactors>
}

interface ProjectileResult {
    events: GameEventPayload[]
    effect?: Extract<MagicEffectSnapshot, { phase: 'flight' | 'impact' }>
}

export function advanceFireProjectile(
    projectile: FireProjectile,
    context: AbilityContext
): ProjectileResult | undefined {
    const { now, navigation } = context
    if (now < projectile.launchedAt) {
        return undefined
    }
    if (!projectile.launched) {
        const { actor, locationId } = projectile
        if (
            !availableToAttack(actor, now) ||
            actor.locationId !== locationId ||
            (actor.controllerKind === 'network_player' && !actor.connected)
        ) {
            return { events: [] }
        }
        projectile.launched = true
        context.onProjectileRelease?.(actor, projectile.position)
    }
    const distanceAtTick = Math.min(
        projectile.range,
        ((now - projectile.launchedAt) * projectile.speed) / 1000
    )
    const remainingStep = distanceAtTick - projectile.traveled
    const clear = clearFlightDistance(projectile, remainingStep, navigation)
    const contact = firstContactDistance(projectile, clear, context)
    const step = contact ?? clear
    projectile.position = positionAlong(projectile, step)
    projectile.traveled += step
    const hasImpact =
        contact !== undefined ||
        clear < remainingStep ||
        projectile.traveled + 1e-8 >= projectile.range
    return hasImpact ? explode(projectile, context) : undefined
}

function clearFlightDistance(
    projectile: FireProjectile,
    length: number,
    navigation: AbilityContext['navigation']
): number {
    const samples = Math.ceil(
        length /
            Math.min(
                2,
                navigation.grid.tileWidth / 4,
                navigation.grid.tileHeight / 4
            )
    )
    for (let index = 1; index <= samples; index += 1) {
        const sample = (index * length) / samples
        const position = positionAlong(projectile, sample)
        if (navigation.isSolidTile(navigation.worldToTile(position))) {
            return ((index - 1) * length) / samples
        }
    }
    return length
}

function firstContactDistance(
    projectile: FireProjectile,
    length: number,
    context: AbilityContext
): number | undefined {
    const { actor, position, direction, locationId } = projectile
    const hitRadius = context.navigation.grid.tileWidth / 3
    let first: number | undefined
    if (projectile.range === 0) {
        return undefined
    }
    for (const target of context.characters) {
        if (target === actor || !availableTarget(target, locationId)) {
            continue
        }
        const x = target.position.x - position.x
        const y = target.position.y - position.y
        const projection = x * direction.x + y * direction.y
        const radial =
            hitRadius * hitRadius - (x * x + y * y - projection * projection)
        if (radial < 0 || projection + Math.sqrt(radial) < 0) {
            continue
        }
        const contact = Math.max(0, projection - Math.sqrt(radial))
        if (
            contact <= length &&
            (first === undefined || contact < first) &&
            context.navigation.hasLineOfSight(
                positionAlong(projectile, contact),
                target.position
            )
        ) {
            first = contact
        }
    }
    return first
}

function positionAlong(
    { position, direction }: FireProjectile,
    length: number
): Vector2 {
    return {
        x: position.x + direction.x * length,
        y: position.y + direction.y * length,
    }
}

function availableTarget(target: GameCharacter, locationId: string): boolean {
    return (
        target.locationId === locationId &&
        target.alive &&
        !target.tags.has('state.retired') &&
        !target.tags.has('offline')
    )
}

function explode(
    projectile: FireProjectile,
    context: AbilityContext
): ProjectileResult {
    const {
        abilityId,
        id,
        maxDamage,
        minDamage,
        position,
        radius,
        direction,
        random,
    } = projectile
    const { now, navigation } = context
    const amount = Math.min(
        maxDamage,
        Math.floor(minDamage + random() * (maxDamage - minDamage + 1))
    )
    const inBlast = (point: Vector2) =>
        distance(position, point) <= radius + 1e-8 &&
        navigation.hasLineOfSight(position, point)
    const { events, firstHostile } = explodeCharacters(
        projectile,
        context,
        amount,
        inBlast
    )
    events.push(...explodeGraves(projectile, context, amount, inBlast))
    const contacts = events.map((event): GameEventPayload => ({
        ...event,
        actionId: id,
        attackOrigin: 'ability',
        delivery: 'magic',
        abilityId: event.abilityId ?? abilityId,
    }))
    if (firstHostile !== undefined) {
        contacts.push(...rewardSpell(projectile, firstHostile, now))
    }
    return {
        events: contacts,
        effect: {
            id,
            abilityId,
            phase: 'impact',
            position: { ...position },
            radius,
            direction: { ...direction },
            expiresAt: now + 300,
        },
    }
}

function explodeCharacters(
    projectile: FireProjectile,
    context: AbilityContext,
    amount: number,
    inBlast: (position: Vector2) => boolean
) {
    const { actor, locationId, random, resourceSpend } = projectile
    const { now } = context
    const events: GameEventPayload[] = []
    let firstHostile: GameCharacter | undefined
    for (const target of new Set([actor, ...context.characters])) {
        if (!availableTarget(target, locationId) || !inBlast(target.position)) {
            continue
        }
        const result = resolveCharacterDamage({
            actor,
            target,
            amount,
            now,
            damageKind: 'arcane',
            respawnDelayMs: context.respawnDelayMsFor?.(target) ?? 15_000,
            random,
        })
        confirmCombatResourceSpend(actor, target, result, [resourceSpend], now)
        events.push(...result.events)
        if (result.trainableDamage > 0) {
            firstHostile ??= target
        }
    }
    return { events, firstHostile }
}

function explodeGraves(
    projectile: FireProjectile,
    context: AbilityContext,
    amount: number,
    inBlast: (position: Vector2) => boolean
): GameEventPayload[] {
    const { actor, locationId, abilityId, resourceSpend } = projectile
    const { graves, now } = context
    if (graves === undefined) {
        return []
    }
    const events: GameEventPayload[] = []
    for (const grave of graves.list(locationId)) {
        if (grave.phase !== 'active' || !inBlast(grave.position)) {
            continue
        }
        const result = damageGrave(
            actor,
            grave,
            {
                abilityId,
                hitAt: now,
                canStun: false,
                damageMultiplier: 1,
                targetEnergyDrain: 0,
            },
            amount,
            false,
            now,
            graves
        )
        if (result.hpDamage > 0) {
            confirmResourceSpend(resourceSpend)
        }
        events.push(...result.events)
    }
    return events
}

function rewardSpell(
    { actor, abilityId, factors, random }: FireProjectile,
    target: GameCharacter,
    now: number
): GameEventPayload[] {
    return [
        ...recordRunicContact(actor, target.id, 'spell', now),
        ...awardMasteries(
            actor,
            [
                {
                    constellationId: 'magic',
                    experience:
                        abilityId === 'fireball'
                            ? MASTERY_REWARDS.fireballHit
                            : MASTERY_REWARDS.greaterFireballHit,
                },
            ],
            { now, random, factors, evidence: [abilityId] }
        ),
    ]
}
