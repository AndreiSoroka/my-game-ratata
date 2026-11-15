import {
    type GameEventPayload,
    GRAVE_PURIFY_BASE_CHANCE,
    type PrayerIntent,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { miracleChance } from './deities'
import { canPurifyGrave } from './gravePrayer'
import { prayerParameters } from './prayerParameters'

export function applyPrayerGraves(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    roll: number,
    receiptId: string
) {
    const events: GameEventPayload[] = []
    const graves = eligibleGraves(actor, intent, context)
    const chance = Math.min(
        0.95,
        (GRAVE_PURIFY_BASE_CHANCE * miracleChance(actor, context.now)) / 0.55
    )
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
        attemptMeaningful: graves.length > 0,
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
