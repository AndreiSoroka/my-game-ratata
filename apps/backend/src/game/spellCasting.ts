import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
    MASTERY_REWARDS,
    type ProgressionClientMessage,
    type SpellSkillId,
} from '@my-game-ratata/contracts'

import { resolveCharacterDamage } from './abilityDamage'
import type { GameCharacter } from './character'
import { availableToStartAttack } from './combat'
import { startCombatAction, type StartedCombatAction } from './combatActions'
import { canAttackCharacter } from './combatTargets'
import { recordRunicContact } from './constellations'
import { effectiveAbility } from './effectiveParameters'
import { castGraveSpell } from './graveSpellCasting'
import { distance } from './math'
import { canPerceivePrayerCaster } from './prayerAuras'
import type { ProgressionContext } from './progressionCommands'
import {
    confirmCombatResourceSpend,
    recordResourceSpend,
} from './resourcePractice'
import { awardMasteries, captureMasteryFactors } from './skillProgression'

const spells: Record<
    SpellSkillId,
    {
        mana: number
        cooldown: number
        range: number
        damage: number
    }
> = {
    fireball: {
        mana: ABILITY_DEFINITIONS.fireball.mana,
        cooldown: 1_000,
        range: 160,
        damage: 8,
    },
    greater_fireball: {
        mana: ABILITY_DEFINITIONS.greater_fireball.mana,
        cooldown: 2_000,
        range: 192,
        damage: 18,
    },
}

export function castSpell(
    actor: GameCharacter,
    message: Extract<ProgressionClientMessage, { type: 'cast_spell' }>,
    context: ProgressionContext
): GameEventPayload[] {
    if (!availableToStartAttack(actor, context.now)) {
        return []
    }
    const spell = resolvedSpell(actor, message.skillId)
    const target = context.characters.find(
        (candidate) => candidate.id === message.targetId
    )
    if (
        !actor.abilities.known.has(message.skillId) ||
        actor.mana < spell.mana ||
        context.now < actor.progression.spellAvailableAt
    ) {
        return []
    }
    if (message.target !== undefined) {
        return message.targetId === undefined
            ? castGraveSpell(actor, message, spell, context)
            : []
    }
    if (!canHit(actor, target, spell.range, context)) {
        return []
    }
    const factors = captureMasteryFactors(actor)
    actor.mana -= spell.mana
    const resourceSpend = recordResourceSpend(actor, 'mana', spell.mana)
    actor.progression.spellAvailableAt = context.now + spell.cooldown
    const started = beginSpell(
        actor,
        target,
        message.skillId,
        spell.range,
        context.now
    )
    const result = resolveCharacterDamage({
        actor,
        target,
        amount: Math.round(spell.damage),
        now: context.now,
        damageKind: 'arcane',
        respawnDelayMs: context.respawnDelayMsFor?.(target) ?? 15000,
        ...(context.random === undefined ? {} : { random: context.random }),
    })
    confirmCombatResourceSpend(
        actor,
        target,
        result,
        [resourceSpend],
        context.now
    )
    const events: GameEventPayload[] = [
        {
            ...started,
            text: message.skillId,
            abilityId: message.skillId,
            damageKind: 'arcane',
        },
        ...result.events.map((event) => ({
            ...event,
            actionId: started.actionId,
            attackOrigin: 'ability' as const,
            delivery: 'magic' as const,
            abilityId: message.skillId,
        })),
    ]
    if (result.trainableDamage > 0) {
        events.push(
            ...recordRunicContact(actor, target.id, 'spell', context.now)
        )
        events.push(...rewardSpellHit(actor, message.skillId, context, factors))
    }
    return events
}
function rewardSpellHit(
    actor: GameCharacter,
    id: SpellSkillId,
    context: ProgressionContext,
    factors: ReturnType<typeof captureMasteryFactors>
): GameEventPayload[] {
    return awardMasteries(
        actor,
        [
            {
                constellationId: 'magic',
                experience:
                    id === 'fireball'
                        ? MASTERY_REWARDS.fireballHit
                        : MASTERY_REWARDS.greaterFireballHit,
            },
        ],
        { now: context.now, random: context.random, factors, evidence: [id] }
    )
}
function resolvedSpell(actor: GameCharacter, id: SpellSkillId) {
    return {
        ...spells[id],
        damage: effectiveAbility(actor, id).damage ?? spells[id].damage,
    }
}

function canHit(
    actor: GameCharacter,
    target: GameCharacter | undefined,
    range: number,
    context: ProgressionContext
): target is GameCharacter {
    if (
        target === undefined ||
        !target.alive ||
        target.tags.has('offline') ||
        target.locationId !== actor.locationId
    ) {
        return false
    }
    return (
        canAttackCharacter(actor, target, context.now) &&
        canPerceivePrayerCaster(actor, target, context.now) &&
        distance(actor.position, target.position) <= range &&
        context.navigation.hasLineOfSight(actor.position, target.position)
    )
}

function beginSpell(
    actor: GameCharacter,
    target: GameCharacter,
    skillId: SpellSkillId,
    range: number,
    now: number
): StartedCombatAction {
    actor.updateFacing({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    return startCombatAction(
        actor,
        now,
        {
            targetId: target.id,
            abilityId: skillId,
            delivery: 'magic',
            canStun: false,
            damageMultiplier: 1,
            targetEnergyDrain: 0,
        },
        { cycleMs: 400, windupMs: 0, movementMs: 400 },
        { kind: 'circle', center: { ...actor.position }, radius: range },
        'immediate'
    )
}
