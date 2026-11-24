import {
    getWorldLocationDefinition,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import {
    type AssetWallet,
    availableGold,
    RewardReservations,
} from './rewardReservations'

interface CityQuestAccount extends AssetWallet {
    initialPublicationBudget: number
    tradeTax: number
}

/** One treasury and reservation namespace for the lifetime of this world. */
export class QuestFunding {
    public readonly reservations = new RewardReservations()
    private readonly funds: Map<string, CityQuestAccount>
    private sequence = 0

    public constructor(
        cityIds: readonly string[] = WORLD_LOCATION_DEFINITIONS.filter(
            (location) => location.biome === 'city'
        ).map((location) => location.id)
    ) {
        this.funds = new Map(
            cityIds.map((id) => {
                const gold =
                    getWorldLocationDefinition(id)?.municipalQuestGold ?? 300
                return [
                    id,
                    {
                        gold,
                        initialPublicationBudget: Math.floor(gold / 4),
                        tradeTax: 0,
                    },
                ]
            })
        )
    }

    public wallet(cityId: string): AssetWallet | undefined {
        return this.funds.get(cityId)
    }

    public availableGold(cityId: string): number {
        const wallet = this.wallet(cityId)
        return wallet === undefined ? 0 : availableGold(wallet)
    }

    public publicationBudget(cityId: string): number {
        const fund = this.funds.get(cityId)
        return fund === undefined
            ? 0
            : fund.initialPublicationBudget + fund.tradeTax
    }

    /** Apply the credit only after the item transfer in the same synchronous settlement. */
    public tradeTaxCredit(
        cityId: string,
        tax: number
    ): (() => void) | undefined {
        const fund = this.funds.get(cityId)
        if (
            fund === undefined ||
            !Number.isSafeInteger(tax) ||
            tax < 0 ||
            !Number.isSafeInteger(fund.gold + tax) ||
            fund.gold + tax < 0 ||
            !Number.isSafeInteger(this.publicationBudget(cityId) + tax)
        ) {
            return undefined
        }
        let committed = false
        return () => {
            if (!committed) {
                committed = true
                fund.gold += tax
                fund.tradeTax += tax
            }
        }
    }

    public newId(prefix: string): string {
        return `${prefix}-${String(++this.sequence)}`
    }
}
