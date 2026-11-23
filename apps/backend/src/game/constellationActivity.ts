import type { GameCharacter } from './character'
import { fullConstellationCatalog } from './constellationNodes'
import { minimumConstellationLevel } from './constellationRequirements'
import { canReceiveMastery, captureMasteryLevels } from './skillProgression'

export function hasStar(actor: GameCharacter, id: string): boolean {
    const { opened, dormant } = actor.progression.constellations
    return opened.has(id) && !dormant.has(id)
}

export function activeConstellationStars(
    actor: GameCharacter
): ReadonlySet<string> {
    const { opened, dormant } = actor.progression.constellations
    return dormant.size === 0
        ? opened
        : new Set([...opened].filter((id) => !dormant.has(id)))
}

/** Preserve past discoveries while disabling effects whose mastery was spent or lost. */
export function refreshConstellationActivity(actor: GameCharacter): void {
    const { opened } = actor.progression.constellations
    const candidates = fullConstellationCatalog.filter((node) =>
        opened.has(node.id)
    )
    const active = new Set(opened)
    const levels = captureMasteryLevels(actor)
    let changed = true
    while (changed) {
        changed = false
        for (const node of candidates) {
            if (
                active.has(node.id) &&
                (levels[node.constellationId] <
                    minimumConstellationLevel(node.id, actor.heroClass) ||
                    node.parents.some((id) => !active.has(id)))
            ) {
                active.delete(node.id)
                changed = true
            }
        }
    }
    actor.progression.constellations.dormant = new Set(
        [...opened].filter((id) => !active.has(id))
    )
}

export function removeDormantAbilities(actor: GameCharacter): void {
    const { dormant } = actor.progression.constellations
    if (dormant.size === 0) {
        return
    }
    for (const node of fullConstellationCatalog) {
        const ability = node.activationAbilityId
        if (ability !== undefined && dormant.has(node.id)) {
            actor.abilities.known.delete(ability)
        }
    }
    // Greater Fireball is derived from Fireball and has its own level requirement.
    if (
        dormant.has('magic.fireball') ||
        dormant.has('magic.greater_fireball')
    ) {
        actor.abilities.known.delete('greater_fireball')
    }
}

export function discoverLifeBreath(actor: GameCharacter): boolean {
    const state = actor.progression.constellations
    const baseEnergy = actor.config.resources.maxEnergy
    if (
        state.opened.has('life.breath') ||
        !hasStar(actor, 'life.energy2') ||
        baseEnergy <= 0 ||
        state.lifeEnergy.recovered + 1e-9 < 3 * baseEnergy ||
        !canReceiveMastery(actor, undefined)
    ) {
        return false
    }
    state.opened.add('life.breath')
    return true
}
