import type { GameCharacter } from './character'
import { syncAbilityConstellations } from './constellations'

/** Authored starting capabilities, applied once by the character spawns. */
export function initializeNpcProgression(actor: GameCharacter): void {
    const { constellations, masteries } = actor.progression
    constellations.opened.add('life.root')
    if (actor.id === 'npc_princess_1') {
        actor.abilities.known.add('pray_road')
        actor.progression.patron = 'road'
        masteries.prayer_road.level = 1
        constellations.opened.add('prayer_road.walk')
    }
    if (actor.id === 'npc_veteran_1') {
        actor.abilities.known.add('shot')
        masteries.blade.level = 1
        masteries.arrow.level = 1
        constellations.opened.add('blade.root')
    }
    syncAbilityConstellations(actor)
}
