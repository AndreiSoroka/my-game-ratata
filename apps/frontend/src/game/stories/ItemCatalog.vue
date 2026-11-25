<script setup lang="ts">
import { ITEM_DEFINITIONS } from '@my-game-ratata/contracts'

import { ItemIcon } from '@/entities/items'
import { UiFrame } from '@/shared/ui/common'

import { itemAssetList } from '../assets/itemCatalog'
</script>

<template>
    <section class="item-catalog game-frame-host" aria-label="Item catalog">
        <UiFrame />
        <h2>Предметы</h2>
        <div class="item-catalog__grid">
            <article v-for="item in itemAssetList" :key="item.id">
                <ItemIcon :item="{ itemId: item.id }" />
                <div>
                    <strong>{{ ITEM_DEFINITIONS[item.id].name }}</strong
                    ><code>{{ item.id }}</code>
                </div>
            </article>
        </div>
    </section>
</template>

<style scoped>
.item-catalog {
    position: relative;
    width: min(620px, 100%);
    padding: 20px;
    color: var(--game-ui-text);
}
h2 {
    margin: 0 0 16px;
}
.item-catalog__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr));
    gap: 12px;
}
article {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
}
strong,
code {
    display: block;
    overflow-wrap: anywhere;
}
code {
    font-size: 11px;
    color: var(--game-ui-muted);
}
</style>
