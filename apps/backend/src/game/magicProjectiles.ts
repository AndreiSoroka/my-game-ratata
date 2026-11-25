import {
    type AshExhaustionRank,
    type GameEventPayload,
    type MagicEffectSnapshot,
    MASTERY_REWARDS,
    type SpellSkillId,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { resolveCharacterDamage } from './abilityDamage'
import { resolveAshExhaustionImpact } from './ashExhaustionImpact'
import type { GameCharacter } from './character'
import { availableToAttack } from './combat'
import { damageWallInArea } from './combatSecretWalls'
import { recordRunicContact } from './constellations'
import { damageGrave } from './graveCombat'
import {
    availableTarget,
    clearFlightDistance,
    firstContactDistance,
    positionAlong,
} from './magicProjectileGeometry'
import { distance } from './math'
import {
    confirmCombatResourceSpend,
    confirmResourceSpend,
    type ResourceSpendReceipt,
} from './resourcePractice'
import { awardMasteries, type captureMasteryFactors } from './skillProgression'

export interface ProjectileFlight {
    id: string
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
    resourceSpend: ResourceSpendReceipt | undefined
    random: () => number
    factors: ReturnType<typeof captureMasteryFactors>
}

interface FireProjectile extends ProjectileFlight {
    abilityId: SpellSkillId
    minDamage: number
    maxDamage: number
}

export interface ExhaustionProjectile extends ProjectileFlight {
    abilityId: 'ash_exhaustion'
    rank: AshExhaustionRank
}

export type MagicProjectile = FireProjectile | ExhaustionProjectile

interface ProjectileResult {
    events: GameEventPayload[]
    effect?: Extract<MagicEffectSnapshot, { phase: 'flight' | 'impact' }>
}

export function advanceMagicProjectile(
    projectile: MagicProjectile,
    context: AbilityContext
): ProjectileResult | undefined {
    const { now, navigation } = context
    if (now < projectile.launchedAt) {
        return undefined
    }
    if (!projectile.launched) {
        if (!canLaunch(projectile, now)) {
            return { events: [] }
        }
        projectile.launched = true
        context.onProjectileRelease?.(projectile.actor, projectile.position)
    }
    const distanceAtTick = Math.min(
        projectile.range,
        ((now - projectile.launchedAt) * projectile.speed) / 1000
    )
    const remainingStep = distanceAtTick - projectile.traveled
    const clear = clearFlightDistance(projectile, remainingStep, navigation)
    const contact = firstContactDistance(projectile, clear, context)
    const step = contact?.distance ?? clear
    projectile.position = positionAlong(projectile, step)
    projectile.traveled += step
    const hasImpact =
        contact !== undefined ||
        clear < remainingStep ||
        projectile.traveled + 1e-8 >= projectile.range
    return hasImpact
        ? resolveProjectileImpact(projectile, contact?.target, context)
        : undefined
}

function resolveProjectileImpact(
    projectile: MagicProjectile,
    target: GameCharacter | undefined,
    context: AbilityContext
): ProjectileResult {
    return projectile.abilityId === 'ash_exhaustion'
        ? {
              events: resolveAshExhaustionImpact(projectile, target, context),
              effect: impactEffect(projectile, context.now),
          }
        : explode(projectile, context)
}

function canLaunch({ actor, locationId }: ProjectileFlight, now: number) {
    return (
        availableToAttack(actor, now) &&
        actor.locationId === locationId &&
        (actor.controllerKind !== 'network_player' || actor.connected)
    )
}

function explode(
    projectile: FireProjectile,
    context: AbilityContext
): ProjectileResult {
    const { abilityId, id, maxDamage, minDamage, position, radius, random } =
        projectile
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
    const contacts = events.map<GameEventPayload>((event) =>
        Object.assign(event, {
            actionId: id,
            attackOrigin: 'ability',
            delivery: 'magic',
            abilityId: event.abilityId ?? abilityId,
        })
    )
    if (firstHostile !== undefined) {
        contacts.push(...rewardSpell(projectile, firstHostile, now))
    }
    contacts.push(
        ...damageWallInArea(context, projectile.actor, position, radius, amount)
    )
    return {
        events: contacts,
        effect: impactEffect(projectile, now),
    }
}

function impactEffect(
    { id, abilityId, position, radius, direction }: MagicProjectile,
    now: number
): NonNullable<ProjectileResult['effect']> {
    return {
        id,
        abilityId,
        phase: 'impact',
        position: { ...position },
        radius,
        direction: { ...direction },
        expiresAt: now + 300,
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
