import type { WorldGraveSnapshot } from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

export function graveName(grave: WorldGraveSnapshot): string {
    return {
        active: tGame('game.world.grave'),
        ruined: tGame('game.world.destroyedGrave'),
        purified: tGame('game.world.cleansedGrave'),
    }[grave.phase]
}
