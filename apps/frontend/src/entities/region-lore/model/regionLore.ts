import { GRID_SIZE } from '@my-game-ratata/contracts'

import { gameLocale, tGame } from '@/shared/lib/i18n'

export interface RegionLoreContent {
    regionName: string
    locationCount: number
    headingFirstLine: string
    headingSecondLine: string
    description: string
    invitation: string
}

export function defaultRegionLore(): RegionLoreContent {
    return {
        regionName: tGame('game.join.region'),
        locationCount: GRID_SIZE * GRID_SIZE,
        headingFirstLine: tGame('game.join.city'),
        headingSecondLine: tGame('game.join.distantLands'),
        description: tGame('game.join.story'),
        invitation: tGame('game.join.invitation'),
    }
}

export function formatLocationCount(count: number): string {
    return tGame('game.join.locations', count).toLocaleUpperCase(gameLocale.value)
}
