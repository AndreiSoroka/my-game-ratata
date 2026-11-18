import type {
    WorldObjectBounds,
    WorldObjectClientMessage,
    WorldObjectSnapshot,
} from './environment'
export type * from './environment'

import type { CityStateSnapshot } from './cityState'
import type { CraftOrderClientMessage } from './craftOrders'
import type { MarketClientMessage } from './economy'
import type { FarmClientMessage, FarmPlotSnapshot } from './farming'
import type { FarmSupplyClientMessage } from './farmSupply'
import type { ItemId } from './index'
import type { QuestRewardMode, QuestRewardShare } from './questRewards'
import type { TreeProfile } from './trees'
export type { TreeProfile } from './trees'

export type AdventureTradeItemId =
    'food' | 'simple_sword' | 'boots' | 'axe' | 'pickaxe' | 'stone_axe'
export type AdventureRecipeId = AdventureTradeItemId | 'bake_bread'
export type AdventureMaterial =
    | 'herbs'
    | 'fiber'
    | 'scrap'
    | 'wood'
    | 'grain'
    | 'stone'
    | 'sapling'
    | 'brushwood'
export type AdventureMaterials = Record<AdventureMaterial, number>

export type AdventureClientMessage =
    | WorldObjectClientMessage
    | FarmClientMessage
    | FarmSupplyClientMessage
    | MarketClientMessage
    | CraftOrderClientMessage
    | { type: 'plant_tree'; position: { x: number; y: number } }
    | { type: 'interact'; targetId: string; service?: MerchantServiceView }
    | {
          type: 'dialogue_choice'
          choiceId: string
          rewardMode?: QuestRewardMode
      }
    | { type: 'trade'; itemId: AdventureTradeItemId }
    | { type: 'gather'; nodeId: string; operation?: GatherOperation }
    | { type: 'craft'; recipeId: AdventureRecipeId }

export type AdventureQuestStatus =
    'available' | 'active' | 'ready' | 'completed' | 'cancelled'

export interface AdventureQuestSnapshot {
    accepted?: boolean
    notice?: string
    rewardMode?: QuestRewardMode
    rewardShares?: QuestRewardShare[]
    requiredItemId?: ItemId
    description: string
    goal: number
    id: string
    kills: number
    rewardGold: number
    status: AdventureQuestStatus
    title: string
}

export interface AdventureDialogueChoice {
    id: string
    label: string
}

export type MerchantServiceView = 'shop' | 'orders' | 'repair'

export interface AdventureDialogue {
    initialView?: MerchantServiceView
    /** Stable across snapshot reads; changes when this dialogue is spoken again. */
    speechId?: number
    kind?: 'conversation' | 'sign'
    canTrade: boolean
    tradeBlockedReason?: string
    choices: AdventureDialogueChoice[]
    npcId: string
    npcName: string
    text: string
    title: string
}

export interface AdventureShopOffer {
    itemId: AdventureTradeItemId
    label: string
    price: number
}

export interface AdventureSnapshot {
    cityState?: CityStateSnapshot
    workshop?: import('./craftOrders').WorkshopSnapshot
    craftOrders?: Array<import('./craftOrders').CraftOrderSnapshot>
    market?: import('./economy').MarketSnapshot
    repairs?: import('./economy').RepairSnapshot
    worldObjects?: WorldObjectSnapshot[]
    dialogue: AdventureDialogue | null
    farmPlots: FarmPlotSnapshot[]
    gold: number
    materials: AdventureMaterials
    noticeId?: number
    notice: string | null
    quest: AdventureQuestSnapshot
    recipes: AdventureRecipe[]
    resourceNodes: AdventureResourceNode[]
    shop: AdventureShopOffer[]
    trophies: number
    wardRestored: boolean
}

export type GatherOperation = 'harvest' | 'clear_stump' | 'cut_sapling'

export interface AdventureResourceNode {
    treeSize?: 'adult' | 'small'
    treeProfile?: TreeProfile
    source?: 'tree' | 'stone' | 'bush' | 'branches'
    phase?: 'ready' | 'stump' | 'growing' | 'depleted' | 'removed'
    readyAt?: number
    propId?: string
    bounds?: WorldObjectBounds
    collisionBounds?: WorldObjectBounds
    matureBounds?: WorldObjectBounds
    visual?: 'forest' | 'pine'
    id: string
    kind: AdventureMaterial
    locationId: string
    position: { x: number; y: number }
    remaining: number
}

export interface AdventureRecipe {
    cost: Partial<AdventureMaterials>
    id: AdventureRecipeId
    itemId: AdventureTradeItemId
    label: string
}
