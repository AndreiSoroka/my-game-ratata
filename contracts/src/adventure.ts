import type {
    WorldObjectClientMessage,
    WorldObjectSnapshot,
} from './environment'
export type * from './environment'

import type { FarmClientMessage, FarmPlotSnapshot } from './farming'
import type { ItemId } from './index'

export type AdventureTradeItemId = 'food' | 'simple_sword' | 'boots'
export type AdventureRecipeId = AdventureTradeItemId | 'bake_bread'
export type AdventureMaterial = 'herbs' | 'fiber' | 'scrap' | 'wood' | 'grain'
export type AdventureMaterials = Record<AdventureMaterial, number>

export type AdventureClientMessage =
    | WorldObjectClientMessage
    | FarmClientMessage
    | { type: 'interact'; targetId: string }
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

export interface AdventureDialogue {
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
