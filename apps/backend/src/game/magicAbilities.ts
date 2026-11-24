import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
    MAGIC_ABILITY_RULES,
} from '@my-game-ratata/contracts'

import { type AbilityContext, authoredAbilityNotice } from './abilityContext'
import { activeBarrier } from './abilityState'
import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import { effectiveAbility } from './effectiveParameters'
import { ensureMagicCombat } from './magicCombat'
import {
    hostileMagicContact,
    recordChainsClipping,
    rewardUtility,
} from './magicPractice'
import {
    activeMagicChannel,
    cancelMagicChannel,
    canMaintainMagic,
    type ChainsChannel,
    chargeChainsThrough,
    finishMagicChannel,
    limitMovementByChains,
    magicBlocksMovement,
    magicChannelFor,
    startMagicChannel,
} from './magicState'
import { distance, facingDirection } from './math'
import { markPositionDiscontinuity } from './positionDiscontinuity'

export type UtilitySpell = 'chains' | 'city_portal' | 'blink' | 'dispel_magic'

export function isUtilitySpell(id: string): id is UtilitySpell {
    return (
        id === 'chains' ||
        id === 'city_portal' ||
        id === 'blink' ||
        id === 'dispel_magic'
    )
}

export function castUtilitySpell(
    actor: GameCharacter,
    id: UtilitySpell,
    context: AbilityContext
): GameEventPayload[] {
    const cost = effectiveAbility(
        actor,
        id,
        context.navigation.grid.tileWidth
    ).mana
    if (actor.mana < cost) {
        return authoredAbilityNotice(actor, 'combat.lowSpellMana')
    }
    ensureMagicCombat(actor, context)
    switch (id) {
        case 'chains':
            return castChains(actor, cost, context)
        case 'city_portal':
            return beginCityPortal(actor, context)
        case 'blink':
            return castBlink(actor, cost, context)
        case 'dispel_magic':
            return castDispel(actor, cost, context)
    }
}

function castChains(
    actor: GameCharacter,
    cost: number,
    context: AbilityContext
): GameEventPayload[] {
    const { now, navigation, sameParty } = context
    const modifiers = constellationModifiers(actor)
    actor.mana -= cost
    return startMagicChannel(actor, {
        abilityId: 'chains',
        radius:
            MAGIC_ABILITY_RULES.chains.radiusTiles * navigation.grid.tileWidth,
        manaPerSecond:
            MAGIC_ABILITY_RULES.chains.drainManaPerSecond *
            modifiers.spellManaMultiplier,
        partyImmune: modifiers.chainsPartyImmune,
        startedAt: now,
        chargedThrough: now,
        practiced: false,
        completesAt: now + modifiers.chainsDurationMs,
        center: { ...actor.position },
        locationId: actor.locationId,
        navigation,
        ...(sameParty === undefined ? {} : { sameParty }),
    })
}

function beginCityPortal(actor: GameCharacter, context: AbilityContext) {
    if (context.canOpenPortal?.(actor, context.now) !== true) {
        return authoredAbilityNotice(actor, 'combat.cityPortalUnavailable')
    }
    return startMagicChannel(actor, {
        abilityId: 'city_portal',
        startedAt: context.now,
        completesAt: context.now + ABILITY_DEFINITIONS.city_portal.windupMs,
        center: { ...actor.position },
        locationId: actor.locationId,
    })
}

export function advanceMagicChannel(
    actor: GameCharacter,
    context: AbilityContext
): GameEventPayload[] {
    const channel = magicChannelFor(actor)
    const { now } = context
    if (channel === undefined) {
        return []
    }
    const input = actor.getMoveInput()
    if (
        !canMaintainMagic(actor, channel, now) ||
        actor.hasPath() ||
        input.x !== 0 ||
        input.y !== 0
    ) {
        return cancelMagicChannel(actor, now)
    }
    if (channel.abilityId === 'chains') {
        return continueChains(actor, channel, now)
    }
    return now < channel.completesAt ? [] : completePortal(actor, context)
}

function continueChains(
    actor: GameCharacter,
    channel: ChainsChannel,
    now: number
) {
    if (!chargeChainsThrough(actor, channel, now)) {
        return cancelMagicChannel(actor, now)
    }
    if (now >= channel.completesAt) {
        return finishMagicChannel(actor, channel.completesAt, 'completed')
    }
    return actor.mana <= 1e-8 ? cancelMagicChannel(actor, now) : []
}

function completePortal(
    actor: GameCharacter,
    context: AbilityContext
): GameEventPayload[] {
    const { now } = context
    const cost = effectiveAbility(actor, 'city_portal').mana
    const opened =
        actor.mana >= cost ? context.openPortal?.(actor, now) : undefined
    if (opened === undefined) {
        return [
            ...cancelMagicChannel(actor, now),
            ...authoredAbilityNotice(actor, 'combat.portalFailed'),
        ]
    }
    pay(actor, 'city_portal', cost, now)
    return [...finishMagicChannel(actor, now, 'completed'), ...opened]
}

function castBlink(
    actor: GameCharacter,
    cost: number,
    context: AbilityContext
) {
    const { navigation, now } = context
    if (magicBlocksMovement(actor, now)) {
        return authoredAbilityNotice(actor, 'combat.chained')
    }
    const direction = facingDirection(actor.facing)
    const range =
        MAGIC_ABILITY_RULES.blink.rangeTiles * navigation.grid.tileWidth
    const desired = navigation.moveWithCollision(actor.position, {
        x: -direction.x * range,
        y: -direction.y * range,
    })
    const destination = limitMovementByChains(actor, desired, now)
    if (distance(actor.position, destination) <= 1e-8) {
        return authoredAbilityNotice(actor, 'combat.noBlinkSpace')
    }
    pay(actor, 'blink', cost, now)
    actor.position = destination
    markPositionDiscontinuity(actor)
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    actor.movement.dashUntil = 0
    actor.velocity = { x: 0, y: 0 }
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            abilityId: 'blink',
            phase: 'completed',
            position: destination,
        } satisfies GameEventPayload,
        ...recordChainsClipping(actor, desired, destination, now),
    ]
}

function castDispel(
    actor: GameCharacter,
    cost: number,
    context: AbilityContext
) {
    const { navigation, now } = context
    const radius =
        MAGIC_ABILITY_RULES.dispel_magic.radiusTiles * navigation.grid.tileWidth
    const events: GameEventPayload[] = [
        {
            kind: 'cast',
            actorId: actor.id,
            abilityId: 'dispel_magic',
            phase: 'completed',
        },
    ]
    pay(actor, 'dispel_magic', cost, now)
    let useful = false
    for (const target of new Set([actor, ...context.characters])) {
        if (!canReachDispel(actor, target, radius, navigation)) {
            continue
        }
        const barrier = activeBarrier(target, now) !== null
        const chains = activeMagicChannel(target, now)?.abilityId === 'chains'
        if (barrier) {
            target.abilities.barrier = null
            events.push({
                kind: 'status',
                actorId: actor.id,
                targetId: target.id,
                statusId: 'barrier',
                expiresAt: now,
                abilityId: 'dispel_magic',
            })
        }
        if (chains) {
            events.push(...cancelMagicChannel(target, now))
        }
        useful ||= (barrier || chains) && hostileMagicContact(actor, target)
    }
    if (useful) {
        events.push(
            ...rewardUtility(actor, 'dispel_magic', now, context.random)
        )
    }
    return events
}

function canReachDispel(
    actor: GameCharacter,
    target: GameCharacter,
    radius: number,
    navigation: AbilityContext['navigation']
): boolean {
    return (
        target.alive &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        target.locationId === actor.locationId &&
        distance(actor.position, target.position) <= radius &&
        navigation.hasLineOfSight(actor.position, target.position)
    )
}

function pay(
    actor: GameCharacter,
    id: UtilitySpell,
    cost: number,
    now: number
) {
    actor.mana -= cost
    actor.abilities.availableAt[id] = now + ABILITY_DEFINITIONS[id].cooldownMs
}
