import type {
    WorldObjectBounds,
    WorldObjectClientMessage,
    WorldObjectSnapshot,
} from './environment'
export type {
    DoorAction,
    DoorState,
    InteractionBoundarySegment,
    WorldObjectBounds,
    WorldObjectClientMessage,
    WorldObjectKind,
    WorldObjectSnapshot,
} from './environment'

import type { CityStateSnapshot } from './cityState'
import type { CraftOrderClientMessage } from './craftOrders'
import type { MarketClientMessage, MarketItemId, MarketSide } from './economy'
import type { FarmClientMessage, FarmPlotSnapshot } from './farming'
import type { FarmSupplyClientMessage } from './farmSupply'
import type { ItemId } from './index'
import type { LocalizedMessage } from './locales'
import type { LightSourceKind } from './portableLights'
import type { QuestRewardMode, QuestRewardShare } from './questRewards'
import type { TreeProfile } from './trees'
export type { TreeProfile } from './trees'

export const BASE_STOCK_MERCHANT_IDS: readonly string[] = [
    'npc_friendly_girl_1',
    'npc_merchant_1',
]
export const HERBALIST_MERCHANT_ID = 'npc_herbalist_1'
export const CITY_HERB_COLLECTOR_IDS: readonly string[] = [
    'npc_friendly_girl_1',
    HERBALIST_MERCHANT_ID,
]

type AdventureRecipeItemId =
    'food' | 'simple_sword' | 'boots' | 'axe' | 'pickaxe' | 'stone_axe'
export type AdventureTradeItemId = AdventureRecipeItemId | LightSourceKind
export type AdventureRecipeId = AdventureRecipeItemId | 'bake_bread'
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
    | { type: 'interact'; targetId: string; service?: NpcInteractionService }
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
    noticeMessage?: LocalizedMessage
    rewardMode?: QuestRewardMode
    rewardShares?: QuestRewardShare[]
    requiredItemId?: ItemId
    description: string
    descriptionMessage?: LocalizedMessage
    goal: number
    id: string
    kills: number
    rewardGold: number
    status: AdventureQuestStatus
    title: string
    titleMessage?: LocalizedMessage
}

export interface AdventureDialogueChoice {
    id: string
    label: string
    labelMessage?: LocalizedMessage
}

export type MerchantServiceView = 'shop' | 'orders' | 'repair'
export type NpcInteractionService =
    MerchantServiceView | 'sell' | 'city_affairs' | 'worker_requests'

export interface AdventureDialogue {
    initialView?: MerchantServiceView
    initialMarketSide?: MarketSide
    marketSides?: MarketSide[]
    /** Stable across snapshot reads; changes when this dialogue is spoken again. */
    speechId?: number
    kind?: 'conversation' | 'sign' | 'quest_board'
    canTrade: boolean
    tradeBlockedReason?: string
    tradeBlockedReasonMessage?: LocalizedMessage
    choices: AdventureDialogueChoice[]
    npcId: string
    npcName: string
    npcNameMessage?: LocalizedMessage
    text: string
    textMessage?: LocalizedMessage
    workerActivity?: import('./workerRequests').WorkerActivitySnapshot
    title: string
    titleMessage?: LocalizedMessage
}

export interface AdventureShopOffer {
    itemId: AdventureTradeItemId
    label: string
    labelMessage?: LocalizedMessage
    price: number
}

export interface QuestBoardEntry {
    id: string
    revision: number
    source: 'guild' | 'worker' | 'story' | 'published'
    title: string
    titleMessage?: LocalizedMessage
    description: string
    descriptionMessage?: LocalizedMessage
    objectiveLabels?: string[]
    objectiveMessages?: Array<LocalizedMessage | null>
    rewardGold: number
    status: 'available' | 'active' | 'ready'
    expiresAt?: number
}

export interface QuestBoardSnapshot {
    objectId: string
    entries: QuestBoardEntry[]
}

export interface AdventureSnapshot {
    cityState?: CityStateSnapshot
    workshop?: import('./craftOrders').WorkshopSnapshot
    craftOrders?: Array<import('./craftOrders').CraftOrderSnapshot>
    market?: import('./economy').MarketSnapshot
    marketInventory?: Partial<
        Record<MarketItemId, { owned: number; sellable: number }>
    >
    repairs?: import('./economy').RepairSnapshot
    worldObjects?: WorldObjectSnapshot[]
    questBoard?: QuestBoardSnapshot
    dialogue: AdventureDialogue | null
    farmPlots: FarmPlotSnapshot[]
    gold: number
    /** Latest committed quest reward or turn-in for this viewer. */
    lastQuestRewardReceiptId?: string
    materials: AdventureMaterials
    noticeId?: number
    notice: string | null
    noticeMessage?: LocalizedMessage
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
    itemId: AdventureRecipeItemId
    label: string
    labelMessage?: LocalizedMessage
}
