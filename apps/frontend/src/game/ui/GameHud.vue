<script setup lang="ts">
import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { characterHudStatus } from './characterHudStatus'
import PlayerStatusPanel from './PlayerStatusPanel.vue'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
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
const emit = defineEmits<{ toggleInventory: []; openMenu: []; createMarker: [] }>()
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
    <div class="hud game-frame-host">
        <GameFrame variant="panel" />
        <div>
            <strong>{{ nickname }}</strong>
            <span v-if="status !== 'Connected'" role="status">{{ connectionLabel }}</span>
        </div>
        <div>
            <span>{{ hud.players }} players</span>
            <GameButton
                icon
                class="hud-menu-button marker-quick-button"
                aria-label="Поставить метку"
                title="Поставить метку · N"
                :disabled="status !== 'Connected' || !player?.alive"
                @click="emit('createMarker')"
                @keydown="activateFocusedButton($event, $event.currentTarget as HTMLElement)"
            >
                ⚑
            </GameButton>
            <GameButton
                icon
                class="hud-menu-button"
                aria-label="Игровое меню"
                title="Меню · Esc"
                @click="emit('openMenu')"
                @keydown="activateFocusedButton($event, $event.currentTarget as HTMLElement)"
            >
                ☰
            </GameButton>
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
        <GameButton
            class="bottom-actions__button"
            :class="{ 'bottom-actions__button--active': inventoryOpen }"
            :aria-pressed="inventoryOpen"
            @click="emit('toggleInventory')"
            @keydown="activateFocusedButton($event, $event.currentTarget as HTMLElement)"
        >
            Inventory
        </GameButton>
    </div>
</template>

<style scoped>
.hud-menu-button {
    display: inline-grid;
    place-items: center;
    min-width: 32px;
    min-height: 28px;
    margin-left: 6px;
    border: 1px solid transparent;
    cursor: pointer;
}
.hud-menu-button:disabled {
    opacity: 0.45;
    cursor: default;
}
</style>
