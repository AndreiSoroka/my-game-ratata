import {
    type GameEventPayload,
    type PrayerIntent,
    prayerManaCost,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import type { GameCharacter } from './character'
import { beginRevive } from './characterLife'
import { resolveMiracle } from './deities'
import { resolvePrayerIntent, validPrayerIntent } from './prayerContext'
import { completePrayer } from './prayerEffects'
import { canPerformSkillAction } from './skillProgression'

export function pray(
    actor: GameCharacter,
    now: number,
    random?: () => number,
    context?: AbilityContext,
    pinnedIntent?: PrayerIntent
): GameEventPayload[] {
    if (context === undefined) {
        return abilityNotice(actor, 'Выберите цель молитвы.')
    }
    const intent = pinnedIntent ?? resolvePrayerIntent(actor, context)
    if (
        !canPerformSkillAction(actor, now) ||
        !validPrayerIntent(actor, intent, context)
    ) {
        return abilityNotice(
            actor,
            'Молитва сейчас не найдёт подходящего ответа.'
        )
    }
    if (now < actor.progression.prayerAvailableAt) {
        return abilityNotice(actor, 'Молитва ещё восстанавливается.')
    }
    const cost = prayerManaCost(intent.mode)
    if (actor.mana < cost) {
        return abilityNotice(actor, 'Недостаточно маны для молитвы.')
    }
    if (intent.mode === 'revive') {
        return startRevivalPrayer(actor, intent, context)
    }
    return regularPrayer(actor, intent, context, random)
}
function regularPrayer(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    random?: () => number
): GameEventPayload[] {
    const now = context.now
    actor.mana -= prayerManaCost(intent.mode)
    actor.progression.prayerAvailableAt = now + 3000
    actor.abilities.availableAt.pray = now + 3000
    actor.lockAction(now, 400)
    actor.setAnimation(intent.mode === 'devotion' ? 'idle' : 'attack', now, 400)
    const cast: GameEventPayload = {
        kind: 'cast',
        actorId: actor.id,
        abilityId: 'pray',
        phase: 'completed',
        ...(intent.targetId === undefined ? {} : { targetId: intent.targetId }),
    }
    if (intent.mode === 'devotion') {
        return [cast]
    }
    const roll = (random ?? context.random ?? Math.random)()
    const outcome = resolveMiracle(actor, now, () => roll)
    return [
        cast,
        ...completePrayer(actor, intent, context, roll, outcome.quality),
    ]
}

function startRevivalPrayer(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext
): GameEventPayload[] {
    const target = context.characters.find(
        (candidate) => candidate.id === intent.targetId
    )
    if (
        target === undefined ||
        !beginRevive(actor, target, context.now, context)
    ) {
        return abilityNotice(actor, 'Воскрешение сейчас невозможно.')
    }
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            targetId: target.id,
            abilityId: 'pray',
            statusId: 'reviving',
            phase: 'started',
            expiresAt: context.now + 3000,
        },
    ]
}
