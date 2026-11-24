import type { GameCharacter } from './character'
import { magicCombatFor } from './magicState'
import { activePrayerAuras } from './prayerAuras'
import type { SimulationContext } from './roomSimulation'
import {
    applyManualStopCorrection,
    hasPendingManualStop,
} from './stopCorrection'

/** Keep the combat gate for the whole step, including actions resolved before publication. */
export function prepareRoomStopCorrections({
    characters,
    now,
    world,
    room,
}: SimulationContext) {
    const waiting = [...characters.values()].filter(hasPendingManualStop)
    if (waiting.length === 0) {
        return undefined
    }
    const watched = new Map(waiting.map((actor) => [actor.locationId, actor]))
    const blocked = new Set<string>()
    function observeCombat(): void {
        for (const [locationId, actor] of watched) {
            if (
                magicCombatFor(actor)?.hasUnresolvedCombat(locationId, now) ===
                true
            ) {
                blocked.add(locationId)
            }
        }
        for (const actor of characters.values()) {
            if (
                watched.has(actor.locationId) &&
                hasUnresolvedCombat(actor, now)
            ) {
                blocked.add(actor.locationId)
            }
        }
    }
    observeCombat()
    return {
        observeCombat,
        apply() {
            observeCombat()
            for (const actor of waiting) {
                applyManualStopCorrection(
                    actor,
                    now,
                    world.get(actor.locationId).navigation,
                    blocked.has(actor.locationId) ||
                        room.social.exchanges.isPaused(actor.id)
                )
            }
        },
    }
}

function hasUnresolvedCombat(actor: GameCharacter, now: number): boolean {
    const { casting } = actor.abilities
    return (
        actor.pendingAttack !== undefined ||
        (actor.combat.action?.readyAt ?? 0) > now ||
        (actor.attackZones.length > 0 && actor.attackZoneUntil > now) ||
        (casting?.mode === 'prayer' && casting.intent.mode === 'harm') ||
        casting?.mode === 'purify_grave' ||
        activePrayerAuras(actor, now) !== undefined
    )
}
