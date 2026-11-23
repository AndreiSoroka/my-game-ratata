<script setup lang="ts">
import { ITEM_DEFINITIONS, type ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'
const props = defineProps<{ item: ItemInstanceSnapshot }>()
const maximum = computed(() => ITEM_DEFINITIONS[props.item.itemId].maxDurability)
const remaining = computed(() => props.item.durability ?? maximum.value ?? 0)
const percent = computed(() => Math.round((remaining.value / (maximum.value ?? 1)) * 100))
</script>
<template>
    <span
        v-if="maximum"
        class="item-condition"
        :class="{ 'item-condition--broken': remaining === 0 }"
        :aria-label="
            tGame('game.character.durabilityCount', { current: remaining, maximum: maximum })
        "
    >
        <span class="item-condition__label">{{
            remaining === 0
                ? tGame('game.character.brokenNeedsRepair')
                : tGame('game.character.durabilityPercent', {
                      percent: percent,
                      current: Math.floor(remaining),
                      maximum: maximum,
                  })
        }}</span>
        <meter
            :value="remaining"
            :max="maximum"
            :low="maximum * 0.2"
            :high="maximum * 0.5"
            :optimum="maximum"
        />
    </span>
</template>
<style scoped>
.item-condition {
    display: grid;
    grid-column: 1 / -1;
    gap: 5px;
    color: #cee0ad;
    font: 12px/1.4 system-ui;
    text-align: left;
}
.item-condition meter {
    width: 100%;
    min-width: 80px;
    height: 12px;
}
.item-condition--broken {
    color: #ff9b86;
}
</style>
