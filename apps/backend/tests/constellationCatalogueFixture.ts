import { constellationCatalogFor } from '../src/game/constellationNodes'
import { undeadExpansionStars } from '../src/game/constellationUndead'

// Historical core counts exclude enemy-only paths and the Undead expansion.
const expansionIds = new Set(undeadExpansionStars.map(({ id }) => id))

export const catalogueWithoutUndeadExpansion = constellationCatalogFor(
    'human'
).filter(({ id }) => !expansionIds.has(id))
