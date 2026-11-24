import { shallowRef } from 'vue'

import type { ExchangeDraftOffer } from './exchangeWindowProps'

export const draftOfferExample: ExchangeDraftOffer = {
    items: [
        { item: { instanceId: 'apple', itemId: 'food', quantity: 5 }, available: 5, selected: 2 },
        {
            item: { instanceId: 'sword', itemId: 'simple_sword', durability: 180 },
            available: 1,
            selected: 1,
        },
    ],
    gold: { available: 12, selected: 7 },
    dirty: true,
    valid: true,
    pending: false,
    canResubmit: false,
    error: '',
}

export function editableDraftExample(initial: ExchangeDraftOffer) {
    const draft = shallowRef(initial)
    function updateItems(selectedFor: (entry: ExchangeDraftOffer['items'][number]) => number) {
        draft.value = {
            ...draft.value,
            items: draft.value.items.map((entry) => ({ ...entry, selected: selectedFor(entry) })),
            dirty: true,
        }
    }
    return {
        draft,
        onChangeItem: (id: string, quantity: number) =>
            updateItems((entry) => (entry.item.instanceId === id ? quantity : entry.selected)),
        onChangeGold(quantity: number) {
            draft.value = {
                ...draft.value,
                gold: { ...draft.value.gold, selected: quantity },
                dirty: true,
            }
        },
        onAll: () => updateItems((entry) => entry.available),
        onClear: () => updateItems(() => 0),
        onPropose() {
            draft.value = { ...draft.value, dirty: false }
        },
    }
}
