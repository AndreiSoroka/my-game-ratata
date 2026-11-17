import { WORLD_LOCATION_DEFINITIONS } from '@my-game-ratata/contracts'

import {
    type AssetWallet,
    availableGold,
    RewardReservations,
} from './rewardReservations'

/** One treasury and reservation namespace for the lifetime of this world. */
export class QuestFunding {
    public readonly reservations = new RewardReservations()
    private readonly funds = new Map<string, AssetWallet>(
        WORLD_LOCATION_DEFINITIONS.filter(
            (location) => location.biome === 'city'
        ).map((location) => [
            location.id,
            { gold: location.municipalQuestGold ?? 300 },
        ])
    )
    private sequence = 0

    public wallet(cityId: string): AssetWallet | undefined {
        return this.funds.get(cityId)
    }

    public availableGold(cityId: string): number {
        const wallet = this.wallet(cityId)
        return wallet === undefined ? 0 : availableGold(wallet)
    }

    public newId(prefix: string): string {
        return `${prefix}-${String(++this.sequence)}`
    }
}
