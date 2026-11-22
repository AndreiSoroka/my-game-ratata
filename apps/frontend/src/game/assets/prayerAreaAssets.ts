import type { PrayerActionId } from '@my-game-ratata/contracts'

const path = '/game/assets/effects/prayers'

export const prayerAreaOpacity = 0.9

export const prayerAreaSources: Record<PrayerActionId, string> = {
    pray: `${path}/hearth.png`,
    pray_road: `${path}/road.png`,
    pray_lantern: `${path}/lantern.png`,
    pray_grave: `${path}/grave.png`,
    pray_woven: `${path}/woven.png`,
}
