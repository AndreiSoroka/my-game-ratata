<script setup lang="ts">
import type { RepairSnapshot } from '@my-game-ratata/contracts'

import { itemName, tGame } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { darkPanelButtonColors, ItemSlot, UiButton } from '@/shared/ui/common'
import { FantasyBorder, FantasyDivider } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

const props = defineProps<{ repairs: RepairSnapshot; gold: number; blocked?: boolean }>()
const emit = defineEmits<{ repair: [instanceIds: string[], expectedTotal: number] }>()
const theme = useDarkPanelTheme()

function canRepair(expectedTotal: number): boolean {
    return !props.blocked && props.gold >= expectedTotal
}

function repair(instanceIds: string[], expectedTotal: number): void {
    if (instanceIds.length && canRepair(expectedTotal)) emit('repair', instanceIds, expectedTotal)
}
</script>
<template>
    <FantasyBorder
        class="repair-workshop"
        role="region"
        :aria-label="tGame('game.trade.equipmentRepairs')"
        :border="theme?.border ?? 'border-026'"
        color="var(--repair-workshop-accent)"
        :style="darkPanelThemeStyle(theme)"
    >
        <header class="repair-workshop__header">
            <h3>{{ tGame('game.trade.equipmentRepairs') }}</h3>
            <p>
                {{ tGame('game.conversation.youHave') }} {{ gold }}
                {{ tGame('game.conversation.gold') }}
            </p>
        </header>
        <FantasyDivider
            divider="divider-002"
            ends="both"
            color="var(--ui-dark-panel-divider)"
            aria-hidden="true"
        />
        <p v-if="!repairs.items.length">{{ tGame('game.trade.allItemsAreInGood') }}</p>
        <ul v-else class="repair-workshop__items">
            <li v-for="item in repairs.items" :key="item.instanceId" class="repair-row">
                <div class="repair-row__item">
                    <ItemSlot size="compact" :src="itemAssetCatalog[item.itemId].src" />
                    <span class="repair-row__details">
                        <strong>{{ itemName(item.itemId) }}</strong>
                        <small :class="{ 'repair-row__condition--broken': item.durability === 0 }"
                            >{{ item.durability }} / {{ item.maxDurability
                            }}{{ item.equipped ? tGame('game.trade.equippedSuffix') : '' }}</small
                        >
                    </span>
                </div>
                <UiButton
                    appearance="panel"
                    panel="panel-001"
                    :colors="darkPanelButtonColors"
                    class="repair-workshop__action"
                    data-dialogue-action
                    :disabled="!canRepair(item.price)"
                    @click="repair([item.instanceId], item.price)"
                >
                    {{ tGame('game.trade.repair') }} {{ item.price }} ◈
                </UiButton>
            </li>
        </ul>
        <UiButton
            v-if="repairs.items.length"
            appearance="panel"
            panel="panel-001"
            variant="primary"
            class="repair-workshop__action repair-workshop__total"
            data-dialogue-action
            :disabled="!canRepair(repairs.total)"
            @click="
                repair(
                    repairs.items.map((item) => item.instanceId),
                    repairs.total
                )
            "
        >
            {{ tGame('game.trade.repairAll') }} {{ repairs.total }} ◈
        </UiButton>
    </FantasyBorder>
</template>
<style scoped>
.repair-workshop {
    --repair-workshop-accent: var(--ui-themed-panel-accent, var(--ui-dark-panel-border));
    --repair-workshop-surface: var(--ui-themed-panel-surface, var(--ui-dark-panel-surface));
    display: grid;
    gap: 4px;
    min-inline-size: 0;
    padding: 4px 2px;
    background: var(--repair-workshop-surface);
    color: var(--ui-dark-panel-text);
    font:
        14px/1.35 system-ui,
        sans-serif;
}
.repair-workshop__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 12px;
}
.repair-workshop__header h3 {
    margin: 0;
    color: var(--ui-dark-panel-title);
    font: 600 clamp(15px, 3vw, 19px)/1.25 var(--ratata-font-family, system-ui);
}
.repair-workshop p {
    margin: 0;
}
.repair-workshop__header p {
    color: var(--ui-light-button-selected-edge);
    font-size: 12px;
}
.repair-workshop__items {
    display: grid;
    gap: 4px;
    max-block-size: 44vh;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--repair-workshop-accent) transparent;
}
.repair-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    padding: 4px;
    background: color-mix(
        in srgb,
        var(--repair-workshop-surface) 94%,
        var(--repair-workshop-accent)
    );
}
.repair-row__item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
}
.repair-row__details {
    overflow-wrap: anywhere;
}
.repair-row__details strong {
    color: var(--ui-dark-panel-title);
}
.repair-workshop__action {
    --ui-button-panel-padding: 0 4px;
    min-block-size: 36px;
    min-inline-size: 0;
    font-size: 13px;
}
.repair-workshop__total {
    justify-self: end;
    margin-block-start: 4px;
}
small {
    display: block;
    font-variant-numeric: tabular-nums;
}
.repair-row__condition--broken {
    color: var(--ui-dark-panel-warning);
}
</style>
