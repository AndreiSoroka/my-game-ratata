<script setup lang="ts">
import type { CharacterSnapshot, WorldGraveSnapshot } from '@my-game-ratata/contracts'

import { healthBarPercent, healthText } from '@/entities/player-vitals'

import { relation } from './combatTargeting'
import GraveDetails from './GraveDetails.vue'
import GameFrame from './primitives/GameFrame.vue'
import type { WorldSelectionTarget } from './worldTargetSelection'

defineProps<{
    target?: CharacterSnapshot
    grave?: WorldGraveSnapshot
    object?: WorldSelectionTarget
    player: CharacterSnapshot
    serverTime: number
}>()
</script>
<template>
    <aside
        v-if="target || grave || object"
        class="target-panel rpg-panel game-frame-host"
        aria-label="Выбранная цель"
    >
        <GameFrame variant="panel" />
        <GraveDetails
            v-if="grave"
            :grave="grave"
            :server-time="serverTime"
            :prayer="player.abilities?.prayers?.pray ?? player.abilities?.prayer"
            compact
        />
        <template v-else-if="target">
            <strong>{{ target.nickname }}</strong
            ><span v-if="!target.trainingTarget && target.health.kind === 'exact'">{{
                healthText(target.health)
            }}</span>
            <progress
                v-if="!target.trainingTarget"
                :value="healthBarPercent(target.health)"
                :max="100"
                aria-label="Здоровье цели"
            />
            <small>{{
                target.id === player.id
                    ? 'Вы'
                    : target.trainingTarget
                      ? 'Тренировочная цель · 1–4 действия'
                      : relation(target, player) === 'hostile'
                        ? 'Враг · 1–4 действия'
                        : 'Союзник · F действия'
            }}</small>
            <small
                v-if="target.workerActivity"
                class="target-work"
                aria-label="Занятие работника"
                >{{ target.workerActivity.text }}</small
            >
        </template>
        <template v-else-if="object">
            <strong>{{ object.name }}</strong>
            <small>Предмет · F действие</small>
        </template>
    </aside>
</template>
<style scoped>
.target-panel {
    position: absolute;
    top: max(58px, calc(var(--game-social-notices-bottom, 0px) + 8px));
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
progress {
    width: 100%;
    height: 6px;
    accent-color: #91b577;
}
@media (max-width: 740px) {
    .target-panel {
        top: max(
            212px,
            calc(var(--game-social-notices-bottom, 0px) + 8px),
            calc(var(--game-social-hints-top, 240px) + var(--ratata-social-hints-height, 0px) + 8px)
        );
        width: 210px;
    }
}
</style>
