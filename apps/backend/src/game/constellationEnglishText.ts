import { artisanEnglishText } from './constellationArtisan'
import { constellationEnglishArcana } from './constellationEnglishArcana'
import { constellationEnglishArrow } from './constellationEnglishArrow'
import { constellationEnglishAsh } from './constellationEnglishAsh'
import { constellationEnglishBlade } from './constellationEnglishBlade'
import { constellationEnglishPrayer } from './constellationEnglishPrayer'
import { constellationEnglishStealthTheft } from './constellationEnglishStealthTheft'
import { constellationEnglishUndead } from './constellationEnglishUndead'

export type StarText = readonly [name: string, description: string]

/** This copy stays on the server. Only learned cards disclose their text. */
export const constellationEnglishText: Readonly<Record<string, StarText>> = {
    ...constellationEnglishBlade,
    ...constellationEnglishArcana,
    ...constellationEnglishPrayer,
    ...constellationEnglishArrow,
    ...constellationEnglishUndead,
    ...constellationEnglishAsh,
    ...constellationEnglishStealthTheft,
    ...artisanEnglishText,
}
