<script setup lang="ts">
import type { ItemId } from '@my-game-ratata/contracts'

import { itemAssetCatalog } from '../assets/itemCatalog'
import { itemStackLabel } from './itemLabels'

defineProps<{ item: { itemId: ItemId; quantity?: number }; showQuantity?: boolean }>()
</script>
<template>
    <span class="rpg-item-icon" :title="itemStackLabel(item)">
        <img
            :src="itemAssetCatalog[item.itemId].src"
            :alt="itemStackLabel(item)"
            draggable="false"
        />
        <b v-if="showQuantity && (item.quantity ?? 1) > 1" aria-hidden="true">{{
            item.quantity
        }}</b>
    </span>
</template>
<style scoped>
.rpg-item-icon {
    position: relative;
    display: grid;
    flex: 0 0 40px;
    width: 40px;
    height: 40px;
    place-items: center;
    background: #101b16;
    border: 1px solid #52674f;
    border-radius: 4px;
}
img {
    width: 28px;
    height: 28px;
    image-rendering: pixelated;
    object-fit: contain;
}
b {
    position: absolute;
    right: 1px;
    bottom: 0;
    padding: 0 3px;
    background: #101b16df;
    color: #fff0bd;
    font: 700 11px/1.3 system-ui;
    border-radius: 2px;
}
</style>
