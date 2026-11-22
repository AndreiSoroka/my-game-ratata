import {
    type GameEventPayload,
    MAGIC_ABILITY_RULES,
    type ProgressionClientMessage,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { availableToStartAttack } from './combat'
import { startCombatAction } from './combatActions'
import { effectiveAbility } from './effectiveParameters'
import { legalGraveTarget } from './graveCombat'
import { ensureMagicCombat } from './magicCombat'
import { distance, facingDirection, normalize } from './math'
import { canPerceivePrayerCaster } from './prayerAuras'
import type { ProgressionContext } from './progressionCommands'
import { recordResourceSpend } from './resourcePractice'
import { captureMasteryFactors } from './skillProgression'

type CastCommand = Extract<ProgressionClientMessage, { type: 'cast_spell' }>

export function castSpell(
    actor: GameCharacter,
    message: CastCommand,
    context: ProgressionContext
): GameEventPayload[] {
    const { now, navigation } = context
    const id = message.skillId
    const tileWidth = navigation.grid.tileWidth
    const definition = effectiveAbility(actor, id, tileWidth)
    if (
        !availableToStartAttack(actor, now) ||
        !actor.abilities.known.has(id) ||
        actor.mana < definition.mana ||
        now < actor.progression.spellAvailableAt
    ) {
        return []
    }
    const { rangeTiles, radiusTiles } = MAGIC_ABILITY_RULES[id]
    const range = rangeTiles * tileWidth
    const radius = radiusTiles * tileWidth
    const aim = aimSpell(actor, message, context, range)
    if (aim === undefined) {
        return []
    }
    const position = { ...actor.position }
    const direction = normalize({
        x: aim.x - position.x,
        y: aim.y - position.y,
    })
    const factors = captureMasteryFactors(actor)
    actor.mana -= definition.mana
    actor.progression.spellAvailableAt = now + definition.cooldownMs
    actor.updateFacing(direction)
    const started = startCombatAction(
        actor,
        now,
        {
            targetId: message.targetId,
            target: message.target,
            abilityId: id,
            delivery: 'magic',
            canStun: false,
            damageMultiplier: 1,
            targetEnergyDrain: 0,
        },
        {
            cycleMs: definition.windupMs,
            windupMs: definition.windupMs,
            movementMs: definition.windupMs,
        },
        { kind: 'circle', center: aim, radius },
        'immediate'
    )
    ensureMagicCombat(actor, context).launch({
        id: started.actionId,
        actor,
        abilityId: id,
        launchedAt: now + definition.windupMs,
        launched: false,
        locationId: actor.locationId,
        position,
        direction,
        range: distance(position, aim),
        traveled: 0,
        radius,
        speed: tileWidth * 20,
        minDamage: Math.round(definition.damage ?? 0),
        maxDamage: Math.round(definition.maxDamage ?? definition.damage ?? 0),
        resourceSpend: recordResourceSpend(actor, 'mana', definition.mana),
        factors,
        random: context.random ?? Math.random,
    })
    return [{ ...started, damageKind: 'arcane' }]
}

function aimSpell(
    actor: GameCharacter,
    message: CastCommand,
    context: ProgressionContext,
    range: number
): Vector2 | undefined {
    if (message.target !== undefined) {
        const grave = context.graves?.get(message.target.id)
        return message.targetId === undefined &&
            legalGraveTarget(actor, grave, context.navigation) &&
            distance(actor.position, grave.position) <= range
            ? { ...grave.position }
            : undefined
    }
    if (message.targetId === undefined) {
        const direction = facingDirection(actor.facing)
        return {
            x: actor.position.x + direction.x * range,
            y: actor.position.y + direction.y * range,
        }
    }
    return aimAtCharacter(actor, message.targetId, context, range)
}

function aimAtCharacter(
    actor: GameCharacter,
    id: string,
    context: ProgressionContext,
    range: number
): Vector2 | undefined {
    const target =
        id === actor.id
            ? actor
            : context.characters.find((candidate) => candidate.id === id)
    if (
        target === undefined ||
        !target.alive ||
        target.locationId !== actor.locationId ||
        target.tags.has('offline') ||
        target.tags.has('state.retired') ||
        !canPerceivePrayerCaster(actor, target, context.now) ||
        !context.navigation.hasLineOfSight(actor.position, target.position) ||
        distance(actor.position, target.position) > range
    ) {
        return undefined
    }
    return { ...target.position }
}
