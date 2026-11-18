<script setup lang="ts">
import type { ItemInstanceSnapshot } from '@my-game-ratata/contracts'

import { itemAssetCatalog } from '../assets/itemCatalog'
import { itemStackLabel } from './itemLabels'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import GameItemSlot from './primitives/GameItemSlot.vue'

defineProps<{
    side: 'bag' | 'chest'
    title: string
    items: ItemInstanceSnapshot[]
    disabled?: boolean
    isItemDisabled?: (item: ItemInstanceSnapshot) => boolean
    actionLabel: string
    emptyText: string
}>()
const emit = defineEmits<{ select: [instanceId: string] }>()
</script>
<template>
    <section
        class="chest-pane game-frame-host"
        :data-chest-pane="side"
        tabindex="-1"
        :aria-label="title"
    >
        <GameFrame variant="panel" />
        <h3>
            {{ title }} <span>{{ items.length }}</span>
        </h3>
        <div class="chest-items">
            <GameButton
                v-for="item in items"
                :key="item.instanceId"
                :data-dialog-action="`${side}:${item.instanceId}`"
                type="button"
                :disabled="disabled || isItemDisabled?.(item)"
                :title="itemStackLabel(item)"
                @click="emit('select', item.instanceId)"
            >
                <GameItemSlot class="chest-item-icon" :quantity="item.quantity">
                    <img :src="itemAssetCatalog[item.itemId].src" alt="" />
                </GameItemSlot>
                <span>{{ itemStackLabel(item) }}</span
                ><small>{{ actionLabel }}</small>
            </GameButton>
            <p v-if="!items.length" class="chest-empty" role="status">{{ emptyText }}</p>
        </div>
        <slot></slot>
    </section>
</template>
