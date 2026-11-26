import { constellationCatalogFor } from '../src/game/constellationNodes'
import { undeadExpansionStars } from '../src/game/constellationUndead'

// Historical core counts predate the Undead expansion and Artisan.
const expansionIds = new Set(undeadExpansionStars.map(({ id }) => id))

export const catalogueWithoutUndeadExpansion = constellationCatalogFor(
    'human'
).filter(
    ({ id, constellationId }) =>
        constellationId !== 'artisan' && !expansionIds.has(id)
)
