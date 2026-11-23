<script setup lang="ts">
import type { AdventureMaterials } from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

import GameFrame from './primitives/GameFrame.vue'

defineProps<{ materials: AdventureMaterials }>()
const labels = {
    get herbs() {
        return tGame('game.character.herbs')
    },
    get fiber() {
        return tGame('game.character.fiber')
    },
    get scrap() {
        return tGame('game.character.metal')
    },
    get wood() {
        return tGame('game.character.timber')
    },
    get grain() {
        return tGame('game.character.wheatGrain')
    },
    get stone() {
        return tGame('game.character.stone')
    },
    get sapling() {
        return tGame('game.character.saplings')
    },
    get brushwood() {
        return tGame('game.character.brushwood')
    },
}
</script>
<template>
    <section class="inventory-materials" :aria-label="tGame('game.character.gatheredMaterials')">
        <h3>{{ tGame('game.character.materials') }}</h3>
        <dl>
            <div
                v-for="(label, kind) in labels"
                :key="kind"
                class="inventory-material-row game-frame-host"
            >
                <GameFrame variant="inset" />
                <dt>{{ label }}</dt>
                <dd>{{ materials[kind] }}</dd>
            </div>
        </dl>
    </section>
</template>
<style scoped>
.inventory-materials {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid #566273;
}
h3 {
    margin: 0 0 10px;
    font-size: 13px;
    color: #eed59b;
}
dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    margin: 0;
}
dl div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 8px;
    font:
        12px/1.4 system-ui,
        sans-serif;
}
dd {
    margin: 0;
    color: #f6d988;
    font-weight: 700;
}
</style>
