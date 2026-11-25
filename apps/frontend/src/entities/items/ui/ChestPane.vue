<script setup lang="ts">
import type { ItemInstanceSnapshot } from '@my-game-ratata/contracts'

import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { darkPanelButtonColors, ItemSlot, UiButton, UiFrame } from '@/shared/ui/common'

import { itemStackLabel } from '../model/itemLabels'

defineProps<{
    side: 'bag' | 'chest'
    title: string
    items: ItemInstanceSnapshot[]
    capacity?: number
    disabled?: boolean
    isItemDisabled?: (item: ItemInstanceSnapshot) => boolean
    actionLabel: string
    emptyText: string
}>()
defineSlots<{ default?: () => unknown }>()
const emit = defineEmits<{ select: [instanceId: string] }>()
</script>
<template>
    <section
        class="chest-pane game-frame-host"
        :data-chest-pane="side"
        tabindex="-1"
        :aria-label="title"
    >
        <UiFrame variant="panel" />
        <h3>
            {{ title }}
            <span
                >{{ items.length
                }}<template v-if="capacity !== undefined"> / {{ capacity }}</template></span
            >
        </h3>
        <div class="chest-items">
            <UiButton
                size="small"
                border="border-015"
                :colors="darkPanelButtonColors"
                v-for="item in items"
                class="chest-item"
                :key="item.instanceId"
                :data-dialog-action="`${side}:${item.instanceId}`"
                type="button"
                :disabled="disabled || isItemDisabled?.(item)"
                :title="itemStackLabel(item)"
                @click="emit('select', item.instanceId)"
            >
                <ItemSlot
                    class="chest-item-icon"
                    :quantity="item.quantity"
                    :src="itemAssetCatalog[item.itemId].src"
                    alt=""
                />
                <span>{{ itemStackLabel(item) }}</span
                ><small>{{ actionLabel }}</small>
            </UiButton>
            <p v-if="!items.length" class="chest-empty" role="status">{{ emptyText }}</p>
        </div>
        <slot></slot>
    </section>
</template>

<style scoped>
.chest-pane {
    position: relative;
    min-width: 0;
    padding: 10px;
    border: 1px solid transparent;
    color: var(--ui-dark-panel-text);
    font:
        14px/1.5 system-ui,
        sans-serif;
}
.chest-pane:focus-visible {
    outline: 2px solid var(--ui-light-button-focus);
    outline-offset: 2px;
}
.chest-pane h3 {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 0 0 12px;
    color: var(--ui-dark-panel-title);
    font:
        14px/1.5 var(--ratata-font-family),
        sans-serif;
}
.chest-pane h3 span {
    color: var(--ui-dark-panel-positive);
    font-size: 12px;
    white-space: nowrap;
}
.chest-items {
    display: grid;
    gap: 7px;
    max-height: min(43dvh, 360px);
    overflow: auto;
    padding: 4px;
    margin: -4px;
}
.chest-item {
    justify-content: stretch;
    padding: 10px 12px;
    text-align: left;
}
.chest-item :deep(.ui-button__content) {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 2px 10px;
    inline-size: 100%;
}
.chest-item small {
    color: var(--ui-dark-panel-title);
    grid-column: 2;
}
.chest-empty {
    margin-block: 13px;
    padding: 20px 0;
    text-align: center;
    font-size: 13px;
}
.chest-item-icon {
    --ui-item-slot-size: 28px;
    --ui-item-slot-image-size: 24px;
    grid-row: span 2;
}
@media (max-width: 740px) {
    .chest-pane {
        padding: 8px;
        font-size: 12px;
    }
    .chest-item {
        padding: 7px;
    }
    .chest-item :deep(.ui-button__content) {
        grid-template-columns: 22px minmax(0, 1fr);
        column-gap: 5px;
    }
    .chest-item small {
        font-size: 10px;
    }
    .chest-pane h3 {
        font-size: 12px;
    }
    .chest-item-icon {
        --ui-item-slot-size: 22px;
        --ui-item-slot-image-size: 18px;
    }
}
</style>
