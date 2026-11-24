<script setup lang="ts">
import type { ItemId } from '@my-game-ratata/contracts'

import { ItemSlot } from '@/shared/ui/common'

import { itemAssetCatalog } from '../assets/itemCatalog'
import { itemStackLabel } from './itemLabels'

defineProps<{ item: { itemId: ItemId; quantity?: number }; showQuantity?: boolean }>()
</script>
<template>
    <ItemSlot
        class="rpg-item-icon"
        :title="itemStackLabel(item)"
        :quantity="showQuantity ? item.quantity : undefined"
        :src="itemAssetCatalog[item.itemId].src"
        :alt="itemStackLabel(item)"
    />
</template>
<style scoped>
.rpg-item-icon {
    flex: 0 0 40px;
}
</style>
