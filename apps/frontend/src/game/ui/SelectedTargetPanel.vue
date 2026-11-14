<script setup lang="ts">
import type { CharacterSnapshot, WorldGraveSnapshot } from '@my-game-ratata/contracts'

import { relation } from './combatTargeting'
import GraveDetails from './GraveDetails.vue'

defineProps<{
    target?: CharacterSnapshot
    grave?: WorldGraveSnapshot
    player: CharacterSnapshot
    serverTime: number
}>()
</script>
<template>
    <aside v-if="target || grave" class="target-panel rpg-panel" aria-label="Выбранная цель">
        <GraveDetails v-if="grave" :grave="grave" :server-time="serverTime" compact />
        <template v-else-if="target">
            <strong>{{ target.nickname }}</strong
            ><span>{{ Math.round((target.hp / Math.max(1, target.maxHp)) * 100) }}%</span>
            <small>{{
                target.id === player.id
                    ? 'Вы'
                    : relation(target, player) === 'hostile'
                      ? 'Враг · 1–4 действия'
                      : 'Союзник · E действия'
            }}</small>
        </template>
    </aside>
</template>
<style scoped>
.target-panel {
    position: absolute;
    top: 58px;
    left: 50%;
    transform: translateX(-50%);
    width: 240px;
    z-index: 4;
    padding: 9px 12px;
    box-sizing: border-box;
}
.target-panel strong {
    font-size: 13px;
}
.target-panel > span {
    float: right;
}
.target-panel small {
    display: block;
    color: #b9c7a4;
    font-size: 10px;
}
@media (max-width: 740px) {
    .target-panel {
        top: 212px;
        width: 210px;
    }
}
</style>
