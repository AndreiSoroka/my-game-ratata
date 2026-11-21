import type { PlayerVitalsData } from '../model/playerVitals'

export interface PlayerVitalsViewProps extends PlayerVitalsData {
    compact?: boolean
    hpAnimated?: boolean
    manaAnimated?: boolean
    energyAnimated?: boolean
    dimSecondaryResources?: boolean
}
