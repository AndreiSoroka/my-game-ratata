import type { AdventureRecipe, MarketItemId } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { type CityState, transferQuantity } from './cityEconomyStock'
export function issueProductionMaterials(
    city: CityState,
    actor: GameCharacter,
    recipe: AdventureRecipe
): boolean {
    const cityPlan = city.inventory.map((item) => ({ ...item }))
    const bagPlan = actor.inventory.map((item) => ({ ...item }))
    for (const [id, amount] of Object.entries(recipe.cost)) {
        if (
            !transferQuantity(
                cityPlan,
                bagPlan,
                id as MarketItemId,
                amount,
                undefined
            )
        ) {
            return false
        }
    }
    city.inventory.splice(0, city.inventory.length, ...cityPlan)
    actor.inventory.splice(0, actor.inventory.length, ...bagPlan)
    return true
}
