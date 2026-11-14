<script setup lang="ts">
import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { characterHudStatus } from './characterHudStatus'
import PlayerStatusPanel from './PlayerStatusPanel.vue'
import { activateFocusedButton } from './uiKeyboard'
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
const emit = defineEmits<{ toggleInventory: []; openMenu: [] }>()
const hud = computed(() => characterHudStatus(props.snapshot?.characters ?? []))
const connectionLabel = computed(() =>
    props.status === 'Connecting'
        ? 'Подключение…'
        : props.status === 'Disconnected'
          ? 'Связь потеряна'
          : props.status
)
</script>

<template>
    <div class="hud">
        <div>
            <strong>{{ nickname }}</strong>
            <span v-if="status !== 'Connected'" role="status">{{ connectionLabel }}</span>
        </div>
        <div>
            <span>{{ hud.players }} players</span>
            <button
                class="hud-menu-button"
                type="button"
                aria-label="Игровое меню"
                title="Меню · Esc"
                @click="emit('openMenu')"
                @keydown="activateFocusedButton($event, $event.currentTarget as HTMLElement)"
            >
                ☰
            </button>
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
    <PlayerStatusPanel v-if="player" :character="player" />
    <slot />
    <div class="bottom-actions" aria-label="Actions">
        <button
            class="bottom-actions__button"
            :class="{ 'bottom-actions__button--active': inventoryOpen }"
            type="button"
            @click="emit('toggleInventory')"
            @keydown="activateFocusedButton($event, $event.currentTarget as HTMLElement)"
        >
            Inventory
        </button>
    </div>
</template>

<style scoped>
.hud-menu-button {
    display: inline-grid;
    place-items: center;
    min-width: 32px;
    min-height: 28px;
    margin-left: 6px;
    border: 1px solid #998565;
    border-radius: 3px;
    background: #243027;
    color: #ead8ac;
    cursor: pointer;
    font: 16px system-ui;
}
.hud-menu-button:focus-visible {
    outline: 2px solid #f5d992;
    outline-offset: 2px;
}
</style>
