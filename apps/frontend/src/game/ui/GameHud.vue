<script setup lang="ts">
import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { characterHudStatus } from './characterHudStatus'
import PlayerStatusPanel from './PlayerStatusPanel.vue'
import WorldLocationPanel from './WorldLocationPanel.vue'

const props = defineProps<{
    nickname: string
    status: string
    snapshot: WorldSnapshot | undefined
    player: CharacterSnapshot | undefined
    localPlayerId: string | undefined
    inventoryOpen: boolean
    testMode: boolean
}>()
const emit = defineEmits<{ toggleInventory: [] }>()
const hud = computed(() => characterHudStatus(props.snapshot?.characters ?? []))
</script>

<template>
    <div class="hud">
        <div>
            <strong>{{ nickname }}</strong>
            <span>{{ status }}</span>
        </div>
        <div>
            <span>{{ hud.players }} players</span>
            <template v-if="testMode">
                <span v-for="ally in hud.allies" :key="ally" class="hud-detail">{{ ally }}</span>
                <span v-for="monster in hud.monsters" :key="monster" class="hud-detail">{{
                    monster
                }}</span>
                <span v-if="localPlayerId" class="hud-detail">{{ localPlayerId }}</span>
            </template>
        </div>
    </div>
    <WorldLocationPanel v-if="snapshot?.location && !inventoryOpen" :location="snapshot.location" />
    <slot name="surface" />
    <PlayerStatusPanel v-if="player" :character="player" :status="status" />
    <slot />
    <div class="bottom-actions" aria-label="Actions">
        <button
            class="bottom-actions__button"
            :class="{ 'bottom-actions__button--active': inventoryOpen }"
            type="button"
            @click="emit('toggleInventory')"
        >
            Inventory
        </button>
    </div>
</template>
