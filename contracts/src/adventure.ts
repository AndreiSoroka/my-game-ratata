import type {
    WorldObjectBounds,
    WorldObjectClientMessage,
    WorldObjectSnapshot,
} from './environment'
export type * from './environment'

import type { CraftOrderClientMessage } from './craftOrders'
import type { MarketClientMessage } from './economy'
import type { FarmClientMessage, FarmPlotSnapshot } from './farming'
import type { ItemId } from './index'

export type AdventureTradeItemId =
    'food' | 'simple_sword' | 'boots' | 'axe' | 'pickaxe' | 'stone_axe'
export type AdventureRecipeId = AdventureTradeItemId | 'bake_bread'
export type AdventureMaterial =
    'herbs' | 'fiber' | 'scrap' | 'wood' | 'grain' | 'stone' | 'sapling'
export type AdventureMaterials = Record<AdventureMaterial, number>

export type AdventureClientMessage =
    | WorldObjectClientMessage
    | FarmClientMessage
    | MarketClientMessage
    | CraftOrderClientMessage
    | { type: 'plant_tree'; position: { x: number; y: number } }
    | { type: 'interact'; targetId: string; service?: MerchantServiceView }
    | { type: 'dialogue_choice'; choiceId: string }
    | { type: 'trade'; itemId: AdventureTradeItemId }
    | { type: 'gather'; nodeId: string }
    | { type: 'craft'; recipeId: AdventureRecipeId }

export type AdventureQuestStatus =
    'available' | 'active' | 'ready' | 'completed'

export interface AdventureQuestSnapshot {
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

export interface AdventureResourceNode {
    source?: 'tree' | 'stone'
    phase?: 'ready' | 'stump' | 'growing' | 'depleted'
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
