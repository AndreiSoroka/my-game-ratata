<script setup lang="ts">
import { ITEM_DEFINITIONS, type ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'
const props = defineProps<{ item: ItemInstanceSnapshot }>()
const maximum = computed(() => ITEM_DEFINITIONS[props.item.itemId].maxDurability)
const remaining = computed(() => props.item.durability ?? maximum.value ?? 0)
const lowThreshold = 0.2
const highThreshold = 0.5
const fraction = computed(() => remaining.value / (maximum.value ?? 1))
const percent = computed(() => Math.round(fraction.value * 100))
const condition = computed(() => {
    if (remaining.value === 0) return 'broken'
    if (fraction.value < lowThreshold) return 'critical'
    if (fraction.value < highThreshold) return 'worn'
    return 'intact'
})
</script>
<template>
    <span v-if="maximum" class="item-condition" :data-condition="condition">
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
            class="item-condition__meter"
            :aria-label="tGame('game.character.durabilityCount', { current: remaining, maximum })"
            :value="remaining"
            :max="maximum"
            :low="maximum * lowThreshold"
            :high="maximum * highThreshold"
            :optimum="maximum"
        />
    </span>
</template>
<style scoped>
.item-condition {
    --item-condition-fill: var(--ui-dark-panel-positive);
    --item-condition-fill-gradient: linear-gradient(
        color-mix(in srgb, var(--item-condition-fill) 82%, var(--ui-light-bar-highlight)),
        var(--item-condition-fill)
    );
    display: grid;
    grid-column: 1 / -1;
    gap: 5px;
    color: var(--ui-dark-panel-text);
    font: 12px/1.4 system-ui;
    font-variant-numeric: tabular-nums;
    text-align: left;
}

.item-condition[data-condition='worn'] {
    --item-condition-fill: var(--ui-light-button-selected-edge);
}

.item-condition[data-condition='critical'],
.item-condition[data-condition='broken'] {
    --item-condition-fill: var(--ui-dark-panel-warning);
    color: var(--ui-dark-panel-warning);
}

.item-condition__meter {
    appearance: none;
    inline-size: 100%;
    block-size: 10px;
    min-inline-size: 0;
    margin-block: 1px;
    box-sizing: border-box;
    border: 1px solid var(--ui-dark-panel-divider);
    border-radius: 4px;
    background: var(--ui-dark-bar-track);
    box-shadow: inset 0 1px 2px var(--ui-light-button-shadow);
}

.item-condition__meter::-webkit-meter-bar {
    block-size: 100%;
    border: 0;
    border-radius: 3px;
    background: transparent;
}

.item-condition__meter::-webkit-meter-optimum-value,
.item-condition__meter::-webkit-meter-suboptimum-value,
.item-condition__meter::-webkit-meter-even-less-good-value {
    border-radius: 3px;
    background: var(--item-condition-fill-gradient);
}

.item-condition__meter::-moz-meter-bar {
    border-radius: 3px;
    background: var(--item-condition-fill-gradient);
}
</style>
