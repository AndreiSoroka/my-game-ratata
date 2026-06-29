<script setup lang="ts">
import type {
    EquipmentActionKind,
    EquipmentSlotId,
    InventoryActionKind,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

import type { ChatInputState } from './game/runtime/chatInput'
import { RatataGame } from './game/runtime/ratataGame'
import ChatInputOverlay from './game/ui/ChatInputOverlay.vue'
import InventoryOverlay from './game/ui/InventoryOverlay.vue'
import PlayerStatusPanel from './game/ui/PlayerStatusPanel.vue'

const nickname = ref('')
const errorMessage = ref('')
const gameHost = ref<HTMLElement>()
const game = ref<RatataGame>()
const chatInput = ref<ChatInputState>({
    active: false,
    draft: '',
    maxLength: 100,
})
const inventoryOpen = ref(false)
const isJoining = ref(false)
const isStarted = ref(false)
const localPlayerId = ref<string>()
const snapshot = ref<WorldSnapshot>()
const status = ref('Ready')

const canJoin = computed(() => nickname.value.trim().length > 0 && !isJoining.value)
const playerCount = computed(
    () =>
        snapshot.value?.characters.filter(
            (character) => character.controllerKind === 'network_player'
        ).length ?? 0
)
const monsterStatuses = computed(() =>
    (snapshot.value?.characters ?? [])
        .filter((character) => character.controllerKind === 'mob1')
        .map(
            (character) =>
                `${formatArchetype(character.archetype)} ${String(character.hp)}/${String(character.maxHp)}`
        )
)
const localCharacter = computed(() => {
    const id = localPlayerId.value

    if (id === undefined) {
        return undefined
    }

    return snapshot.value?.characters.find((character) => character.id === id)
})
async function joinGame(): Promise<void> {
    if (!canJoin.value) {
        return
    }

    errorMessage.value = ''
    isJoining.value = true
    isStarted.value = true
    await nextTick()

    if (gameHost.value === undefined) {
        errorMessage.value = 'Game surface is not ready'
        cleanupFailedJoin()
        return
    }

    const runtime = new RatataGame({
        container: gameHost.value,
        nickname: nickname.value.trim(),
        onChatState: (state) => {
            chatInput.value = state
        },
        onError: (message) => {
            errorMessage.value = message
            cleanupFailedJoin()
        },
        onInventoryToggle: () => {
            toggleInventory()
        },
        onSnapshot: (nextSnapshot, nextLocalPlayerId) => {
            snapshot.value = nextSnapshot
            localPlayerId.value = nextLocalPlayerId
            isJoining.value = false
        },
        onStatus: (message) => {
            status.value = message
        },
    })

    game.value = runtime
    await runtime.start().catch((error: unknown) => {
        errorMessage.value = error instanceof Error ? error.message : 'Game failed to start'
        cleanupFailedJoin()
    })
}

function cleanupFailedJoin(): void {
    if (localPlayerId.value !== undefined) {
        isJoining.value = false
        return
    }

    game.value?.stop()
    game.value = undefined
    localPlayerId.value = undefined
    snapshot.value = undefined
    inventoryOpen.value = false
    chatInput.value = {
        active: false,
        draft: '',
        maxLength: 100,
    }
    isJoining.value = false
    isStarted.value = false
    status.value = 'Ready'
}

function formatArchetype(archetype: string): string {
    return archetype.charAt(0).toUpperCase() + archetype.slice(1)
}

function toggleInventory(): void {
    inventoryOpen.value = !inventoryOpen.value
}

function closeInventory(): void {
    inventoryOpen.value = false
}

function sendInventoryAction(payload: {
    action: InventoryActionKind
    itemInstanceId: string
}): void {
    game.value?.sendInventoryAction(payload.action, payload.itemInstanceId)
}

function sendEquipmentAction(payload: {
    action: EquipmentActionKind
    slot: EquipmentSlotId
}): void {
    game.value?.sendEquipmentAction(payload.action, payload.slot)
}

onBeforeUnmount(() => {
    game.value?.stop()
})
</script>

<template>
    <main class="app-shell">
        <section v-if="!isStarted" class="join-screen" aria-labelledby="join-title">
            <form class="join-panel" @submit.prevent="joinGame">
                <h1 id="join-title">Ratata</h1>
                <label for="nickname">Nickname</label>
                <div class="join-row">
                    <input
                        id="nickname"
                        v-model="nickname"
                        autocomplete="nickname"
                        maxlength="24"
                        minlength="1"
                        required
                        type="text"
                    />
                    <button :disabled="!canJoin" type="submit">Enter</button>
                </div>
                <p v-if="errorMessage" class="join-error">{{ errorMessage }}</p>
            </form>
        </section>

        <section v-else class="game-screen" aria-label="Ratata game">
            <div class="hud">
                <div>
                    <strong>{{ nickname }}</strong>
                    <span>{{ status }}</span>
                </div>
                <div>
                    <span>{{ playerCount }} players</span>
                    <span v-for="monster in monsterStatuses" :key="monster">{{ monster }}</span>
                    <span v-if="localPlayerId">{{ localPlayerId }}</span>
                </div>
            </div>
            <div ref="gameHost" class="game-host" data-testid="game-host"></div>
            <PlayerStatusPanel v-if="localCharacter" :character="localCharacter" :status="status" />
            <InventoryOverlay
                v-if="inventoryOpen && localCharacter"
                :character="localCharacter"
                :chests="snapshot?.chests ?? []"
                @close="closeInventory"
                @equipment-action="sendEquipmentAction"
                @inventory-action="sendInventoryAction"
            />
            <div class="bottom-actions" aria-label="Actions">
                <button
                    class="bottom-actions__button"
                    :class="{ 'bottom-actions__button--active': inventoryOpen }"
                    type="button"
                    @click="toggleInventory"
                >
                    Inventory
                </button>
            </div>
            <ChatInputOverlay v-if="chatInput.active" :state="chatInput" />
            <p v-if="errorMessage" class="game-error">{{ errorMessage }}</p>
        </section>
    </main>
</template>
