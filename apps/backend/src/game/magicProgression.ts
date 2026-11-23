import { canLearnDiscipline, isArcaneAbility } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { magicLevelAbilities } from './constellationMagicStars'

export function syncMagicConstellation(actor: GameCharacter): void {
    const { known } = actor.abilities
    const { opened } = actor.progression.constellations
    if ([...known].some(isArcaneAbility)) {
        opened.add('magic.root')
    }
    if (known.has('fireball')) {
        opened.add('magic.fireball')
    }
    if (opened.has('magic.root') && canLearnDiscipline(known, 'magic')) {
        const level = actor.progression.masteries.magic.level
        if (opened.has('magic.fireball') && level >= 3) {
            known.add('fireball')
        }
        if (known.has('fireball') && level >= 10) {
            known.add('greater_fireball')
        }
        for (const [id, minimumLevel] of magicLevelAbilities) {
            if (level >= minimumLevel) {
                known.add(id)
                opened.add(`magic.${id}`)
            }
        }
    }
    if (known.has('greater_fireball')) {
        opened.add('magic.greater_fireball')
    }
}
