import type { WorkshopOffer, WorkshopSnapshot } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

export function createWorkshopOrderSelection(getWorkshop: () => WorkshopSnapshot) {
    const selectedId = ref<WorkshopOffer['itemId']>()
    const cancelId = ref<string>()
    const selected = computed(() =>
        getWorkshop().offers.find((offer) => offer.itemId === selectedId.value)
    )
    const cancelling = computed(() =>
        getWorkshop().orders.find((order) => order.id === cancelId.value)
    )
    return { selectedId, cancelId, selected, cancelling }
}
