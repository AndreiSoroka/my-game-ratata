import type { ItemId } from './inventory'
import { CENTER_LOCATION_ID } from './world'

export interface WorkshopDefinition {
    npcId: string
    cityId: string
    items: readonly ItemId[]
    recipeIds: readonly string[]
    repair: boolean
}
export const WORKSHOP_DEFINITIONS: readonly WorkshopDefinition[] = [
    {
        npcId: 'npc_smith_1',
        cityId: CENTER_LOCATION_ID,
        items: ['simple_sword', 'axe', 'pickaxe', 'stone_axe'],
        recipeIds: ['simple_sword', 'axe', 'pickaxe', 'stone_axe'],
        repair: true,
    },
    {
        npcId: 'npc_weaver_1',
        cityId: CENTER_LOCATION_ID,
        items: ['boots'],
        recipeIds: ['boots'],
        repair: false,
    },
    {
        npcId: 'npc_baker_1',
        cityId: CENTER_LOCATION_ID,
        items: ['food'],
        recipeIds: ['bake_bread', 'food'],
        repair: false,
    },
]
export function workshopFor(npcId: string): WorkshopDefinition | undefined {
    return WORKSHOP_DEFINITIONS.find((workshop) => workshop.npcId === npcId)
}

export type CraftOrderClientMessage =
    | {
          type: 'craft_order_place'
          npcId: string
          itemId: ItemId
          expectedTotal: number
          requestId: string
      }
    | {
          type: 'craft_order_claim'
          npcId: string
          orderId: string
          expectedRemaining: number
          requestId: string
      }
    | {
          type: 'craft_order_cancel'
          npcId: string
          orderId: string
          requestId: string
      }

export type CraftOrderStatus =
    | 'waiting_materials'
    | 'queued'
    | 'ready'
    | 'collected'
    | 'cancelled'
    | 'released'
export interface CraftOrderSnapshot {
    id: string
    npcId: string
    itemId: ItemId
    label: string
    status: CraftOrderStatus
    fullPrice: number
    deposit: number
    remaining: number
    createdAt: number
    releaseAt?: number
}
export interface WorkshopOffer {
    itemId: ItemId
    label: string
    stock: number
    fullPrice: number
    deposit: number
    remaining: number
    canOrder: boolean
}
export interface WorkshopSnapshot {
    npcId: string
    offers: WorkshopOffer[]
    orders: CraftOrderSnapshot[]
}
