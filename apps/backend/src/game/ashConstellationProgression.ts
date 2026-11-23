import type { GameCharacter } from './character'
import { hasStar } from './constellationActivity'
import { ashStars } from './constellationAshStars'
import { constellationRequirementsSatisfied } from './constellationRequirements'
import { captureMasteryLevels } from './skillProgression'

export function syncAshConstellation(actor: GameCharacter): void {
    const { known } = actor.abilities
    if (!known.has('pray_grave')) {
        return
    }
    const { opened } = actor.progression.constellations
    const context = {
        opened,
        levels: captureMasteryLevels(actor),
        knownAbilities: known,
    }
    for (const node of ashStars) {
        if (
            node.acquisition === 'event' &&
            constellationRequirementsSatisfied(node, context)
        ) {
            opened.add(node.id)
            if (
                node.activationAbilityId !== undefined &&
                hasStar(actor, node.id)
            ) {
                known.add(node.activationAbilityId)
            }
        }
    }
}
