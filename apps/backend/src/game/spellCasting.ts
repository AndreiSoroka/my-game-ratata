import type {
    GameEventPayload,
    ProgressionClientMessage,
    SpellSkillId,
} from '@my-game-ratata/contracts'

import { resolveCharacterDamage } from './abilityDamage'
import type { GameCharacter } from './character'
import { availableToStartAttack } from './combat'
import { canAttackCharacter } from './combatTargets'
import { castGraveSpell } from './graveSpellCasting'
import { distance } from './math'
import type { ProgressionContext } from './progressionCommands'
import { trainSkill } from './skillProgression'

const spells: Record<
    SpellSkillId,
    {
        mana: number
        cooldown: number
        range: number
        damage: number
        growth: number
    }
> = {
    fireball: { mana: 12, cooldown: 1_000, range: 160, damage: 8, growth: 2 },
    greater_fireball: {
        mana: 24,
        cooldown: 2_000,
        range: 192,
        damage: 18,
        growth: 3,
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
    const skill = actor.progression.skills[message.skillId]
    const spell = spells[message.skillId]
    const target = context.characters.find(
        (candidate) => candidate.id === message.targetId
    )
    if (
        !skill.unlocked ||
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
    actor.mana -= spell.mana
    actor.progression.spellAvailableAt = context.now + spell.cooldown
    actor.lockAction(context.now, 400)
    actor.updateFacing({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    actor.setAnimation('attack', context.now, 400)
    const result = resolveCharacterDamage({
        actor,
        target,
        amount: spell.damage + (skill.level - 1) * spell.growth,
        now: context.now,
        damageKind: 'arcane',
        respawnDelayMs: context.respawnDelayMsFor?.(target) ?? 15000,
    })
    const events: GameEventPayload[] = [
        {
            actorId: actor.id,
            targetId: target.id,
            kind: 'attack',
            text: message.skillId,
            abilityId: message.skillId,
            damageKind: 'arcane',
        },
        ...result.events,
        ...(result.trainableDamage > 0
            ? trainSkill(actor, message.skillId)
            : []),
    ]
    return events
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
        distance(actor.position, target.position) <= range &&
        context.navigation.hasLineOfSight(actor.position, target.position)
    )
}
