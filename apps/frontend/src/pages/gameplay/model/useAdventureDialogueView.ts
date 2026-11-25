import type { AdventureDialogue, MarketSide } from '@my-game-ratata/contracts'
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'

import { marketWindowContext } from './marketWindowContext'

type View = 'conversation' | 'shop' | 'repair' | 'demand' | 'orders'

export function useAdventureDialogueView(readDialogue: () => AdventureDialogue | null) {
    const context = inject(marketWindowContext, undefined)
    const view = ref<View>('conversation')
    const marketSide = ref<MarketSide>()
    const shopRequest = ref(0)
    const returningToWhisper = ref(false)
    const shopVisible = computed(() => view.value === 'shop' && readDialogue()?.canTrade === true)
    const conversationVisible = computed(
        () => Boolean(readDialogue()) && !shopVisible.value && !returningToWhisper.value
    )

    function isWhisperPartner(npcId?: string): boolean {
        return npcId !== undefined && npcId === context?.whisperPartnerId.value
    }
    function returnToWhisper(): boolean {
        returningToWhisper.value = isWhisperPartner(readDialogue()?.npcId)
        return returningToWhisper.value
    }
    function openShop(side?: MarketSide): void {
        marketSide.value = side
        view.value = 'shop'
    }

    watch(
        [
            () => readDialogue()?.npcId,
            () => readDialogue()?.initialView,
            () => readDialogue()?.initialMarketSide,
            () => readDialogue()?.initialView && readDialogue()?.speechId,
        ],
        ([npcId, initialView, initialMarketSide], [previousNpcId]) => {
            if (!initialView && npcId === previousNpcId && view.value === 'shop') return
            if (npcId !== previousNpcId || initialView) returningToWhisper.value = false
            if (initialView !== 'shop') {
                view.value = initialView ?? 'conversation'
                return
            }
            if (readDialogue()?.canTrade !== true) {
                view.value = 'conversation'
                return
            }
            openShop(initialMarketSide)
            shopRequest.value++
        },
        { immediate: true }
    )
    watch(
        shopVisible,
        (visible) => {
            if (context) context.shopOpen.value = visible
            if (!visible && view.value === 'shop') view.value = 'conversation'
        },
        { immediate: true }
    )
    onBeforeUnmount(() => {
        if (context) context.shopOpen.value = false
    })
    return {
        view,
        shopVisible,
        conversationVisible,
        marketSide,
        shopRequest,
        isWhisperPartner,
        returnToWhisper,
        openShop,
    }
}
