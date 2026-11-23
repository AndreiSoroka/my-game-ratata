import type { PrayerActionId } from '@my-game-ratata/contracts'

const path = '/game/assets/effects/prayers'

export const prayerAreaOpacity = 0.32
export const prayerAreaPulseAmplitude = 0.08
export const prayerAreaPulseDurationMs = 1600

export const prayerAreaSources: Record<PrayerActionId, string> = {
    pray: `${path}/hearth.png`,
    pray_road: `${path}/road.png`,
    pray_lantern: `${path}/lantern.png`,
    pray_grave: `${path}/grave.png`,
    pray_woven: `${path}/woven.png`,
}
