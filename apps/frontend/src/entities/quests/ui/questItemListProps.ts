import type { ItemId } from '@my-game-ratata/contracts'

export interface QuestItem {
    itemId: ItemId
    quantity: number
}

export interface QuestItemListProps {
    items: readonly QuestItem[]
    kind?: 'required' | 'reward'
    showHeading?: boolean
}
