import { fullConstellationCatalog } from '../src/game/constellationNodes'
import { undeadExpansionStars } from '../src/game/constellationUndead'

// The common catalogue counts are independent of the Undead expansion.
const expansionIds = new Set(undeadExpansionStars.map(({ id }) => id))

export const catalogueWithoutUndeadExpansion = fullConstellationCatalog.filter(
    ({ id }) => !expansionIds.has(id)
)
