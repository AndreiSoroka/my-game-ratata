import type {
    GameEventPayload,
    ProgressionClientMessage,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { startCombatAction } from './combatActions'
import { legalGraveTarget } from './graveCombat'
import { distance } from './math'
import type { ProgressionContext } from './progressionCommands'
import { recordPaidResources } from './resourcePractice'

/** Uses the same spell costs and cast lock, resolving world damage at its end. */
export function castGraveSpell(
    actor: GameCharacter,
    message: Extract<ProgressionClientMessage, { type: 'cast_spell' }>,
    spell: {
        mana: number
        cooldown: number
        range: number
        damage: number
    },
    context: ProgressionContext
): GameEventPayload[] {
    const target = message.target
    const grave =
        target === undefined ? undefined : context.graves?.get(target.id)
    if (
        target === undefined ||
        !legalGraveTarget(actor, grave, context.navigation) ||
        distance(actor.position, grave.position) > spell.range
    ) {
        return []
    }
    const before = { mana: actor.mana, energy: actor.energy }
    actor.mana -= spell.mana
    actor.progression.spellAvailableAt = context.now + spell.cooldown
    actor.updateFacing({
        x: grave.position.x - actor.position.x,
        y: grave.position.y - actor.position.y,
    })
    actor.attackZones = [
        {
            ownerId: actor.id,
            minX: actor.position.x - spell.range,
            maxX: actor.position.x + spell.range,
            minY: actor.position.y - spell.range,
            maxY: actor.position.y + spell.range,
        },
    ]
    const started = startCombatAction(
        actor,
        context.now,
        {
            resourceSpends: recordPaidResources(actor, before),
            target,
            abilityId: message.skillId,
            delivery: 'magic',
            rawDamage: spell.damage,
            maxRange: spell.range,
            canStun: false,
            damageMultiplier: 1,
            targetEnergyDrain: 0,
        },
        { cycleMs: 400, windupMs: 400, movementMs: 400 },
        { kind: 'rectangles', zones: actor.attackZones }
    )
    return [
        {
            ...started,
            text: message.skillId,
            damageKind: 'arcane',
        },
    ]
}
