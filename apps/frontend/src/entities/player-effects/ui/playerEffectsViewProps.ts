import type { PlayerEffect } from '../model/playerEffects'

export interface PlayerEffectsData {
    effects: readonly PlayerEffect[]
    compact?: boolean
}
