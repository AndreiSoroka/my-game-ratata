import {
    type GameEventPayload,
    MASTERY_REWARDS,
    type PrayerActionId,
    type PrayerIntent,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { miracleChance } from './deities'
import { canPurifyGrave } from './gravePrayer'
import { prayerParameters } from './prayerParameters'
import { prayerPurificationChance } from './prayerProbability'

export function applyPrayerGraves(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    roll: number,
    receiptId: string,
    abilityId: PrayerActionId = 'pray'
) {
    const events: GameEventPayload[] = []
    if (abilityId !== 'pray') {
        return {
            events,
            meaningful: false,
            experience: 0,
        }
    }
    const graves = eligibleGraves(actor, intent, context)
    const chance = prayerPurificationChance(
        miracleChance(actor, context.now, 'hearth')
    )
    let experience = 0
    if (roll < chance) {
        for (const grave of graves) {
            const contribution = context.graves?.contributePurification(
                grave.id,
                receiptId,
                context.now
            )
            if (contribution?.accepted !== true) {
                continue
            }
            experience += contribution.purified
                ? MASTERY_REWARDS.graveFinal
                : MASTERY_REWARDS.graveStep
            events.push({
                kind: contribution.purified
                    ? 'grave_purified'
                    : 'grave_purification_progress',
                actorId: actor.id,
                abilityId: 'pray',
                target: { kind: 'grave', id: grave.id },
            })
        }
    }
    return {
        events,
        meaningful: events.length > 0,
        experience,
    }
}

function eligibleGraves(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext
) {
    if (intent.mode === 'revive') {
        return []
    }
    const area = prayerParameters(actor, context.navigation.grid.tileWidth).area
    return (context.graves?.list(actor.locationId) ?? []).filter(
        (grave) =>
            (area ||
                (intent.mode === 'purify_grave' &&
                    intent.target.id === grave.id)) &&
            canPurifyGrave(actor, grave.id, context)
    )
}
