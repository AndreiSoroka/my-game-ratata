<script setup lang="ts">
import { computed } from 'vue'

import { itemName, tGame } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { ItemSlot } from '@/shared/ui/common'

import type { QuestItemListProps } from './questItemListProps'

const props = withDefaults(defineProps<QuestItemListProps>(), {
    kind: 'required',
    showHeading: true,
})
const heading = computed(() =>
    tGame(props.kind === 'required' ? 'game.quests.requiredItems' : 'game.quests.reward')
)
const rows = computed(() =>
    props.items.map(({ itemId, quantity, available }) => {
        const name = itemName(itemId)
        const missing = available !== undefined && available < quantity
        return {
            itemId,
            missing,
            label: missing
                ? tGame('game.quests.requiredItemShortage', {
                      name,
                      available,
                      required: quantity,
                      missing: quantity - available,
                  })
                : `${name} × ${quantity}`,
        }
    })
)
</script>

<template>
    <section v-if="items.length" class="quest-item-list">
        <h3 v-if="showHeading">{{ heading }}</h3>
        <ul :aria-label="heading" role="list">
            <li
                v-for="(item, index) in rows"
                :key="index"
                :class="{ 'quest-item-list__item--missing': item.missing }"
            >
                <ItemSlot size="compact" :src="itemAssetCatalog[item.itemId].src" alt="" />
                <span>{{ item.label }}</span>
            </li>
        </ul>
        <p v-if="kind === 'reward'" class="quest-item-list__reward-note">
            {{ tGame('game.quests.personWhoTurnsInContract') }}
        </p>
    </section>
</template>

<style scoped>
.quest-item-list {
    margin-block: 12px;
}
.quest-item-list ul {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0;
    list-style: none;
}
.quest-item-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-inline-size: 0;
    padding: 2px 8px;
    border: 1px solid var(--quest-item-list-border, var(--ui-light-panel-divider));
    background: var(--quest-item-list-surface, var(--ui-light-panel-parchment));
    overflow-wrap: anywhere;
}
.quest-item-list .quest-item-list__item--missing {
    border-color: var(--ui-light-panel-warning);
    color: var(--ui-light-panel-warning);
}
.quest-item-list__reward-note {
    color: var(--quest-panel-muted, var(--ui-light-panel-muted));
}
</style>
