<script setup lang="ts">
import type { ItemInstanceSnapshot } from '@my-game-ratata/contracts'

import { itemAssetCatalog } from '../assets/itemCatalog'
import { itemStackLabel } from './itemLabels'

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
    <section class="chest-pane" :data-chest-pane="side" tabindex="-1" :aria-label="title">
        <h3>
            {{ title }} <span>{{ items.length }}</span>
        </h3>
        <div class="chest-items">
            <button
                v-for="item in items"
                :key="item.instanceId"
                :data-dialog-action="`${side}:${item.instanceId}`"
                type="button"
                :disabled="disabled || isItemDisabled?.(item)"
                :title="itemStackLabel(item)"
                @click="emit('select', item.instanceId)"
            >
                <div class="chest-item-icon">
                    <img :src="itemAssetCatalog[item.itemId].src" alt="" /><b
                        v-if="(item.quantity ?? 1) > 1"
                        class="chest-item-quantity"
                        aria-hidden="true"
                        >{{ item.quantity }}</b
                    >
                </div>
                <span>{{ itemStackLabel(item) }}</span
                ><small>{{ actionLabel }}</small>
            </button>
            <p v-if="!items.length" class="chest-empty" role="status">{{ emptyText }}</p>
        </div>
        <slot></slot>
    </section>
</template>
