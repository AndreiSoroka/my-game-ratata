import type { ItemId } from './index'

export type GameEventKind =
    | 'attack'
    | 'dash'
    | 'chat'
    | 'chest_open'
    | 'water_drink'
    | 'barrel_search'
    | 'farm_sow'
    | 'farm_harvest'
    | 'damage'
    | 'death'
    | 'item_drop'
    | 'item_eat'
    | 'item_equip'
    | 'item_pickup'
    | 'item_stash'
    | 'join'
    | 'leave'
    | 'respawn'
    | 'notice'
    | 'permadeath'
    | 'revive'
    | 'level_up'
    | 'skill_up'

export interface GameEventPayload {
    /** Authoritative recipient filter; stripped before sending over a socket. */
    audienceIds?: string[]
    amount?: number
    actorId?: string
    chestId?: string
    plotId?: string
    itemId?: ItemId
    kind: GameEventKind
    targetId?: string
    text?: string
}
