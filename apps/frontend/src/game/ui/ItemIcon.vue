<script setup lang="ts">
import type { ItemId } from '@my-game-ratata/contracts'

import { itemAssetCatalog } from '../assets/itemCatalog'
import { itemStackLabel } from './itemLabels'
import GameItemSlot from './primitives/GameItemSlot.vue'

defineProps<{ item: { itemId: ItemId; quantity?: number }; showQuantity?: boolean }>()
</script>
<template>
    <GameItemSlot
        class="rpg-item-icon"
        :title="itemStackLabel(item)"
        :quantity="showQuantity ? item.quantity : undefined"
    >
        <img
            :src="itemAssetCatalog[item.itemId].src"
            :alt="itemStackLabel(item)"
            draggable="false"
        />
    </GameItemSlot>
</template>
<style scoped>
.rpg-item-icon {
    flex: 0 0 40px;
    width: 40px;
    height: 40px;
}
img {
    width: 28px;
    height: 28px;
    image-rendering: pixelated;
    object-fit: contain;
}
</style>
