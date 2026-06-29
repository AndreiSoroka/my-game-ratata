<script setup lang="ts">
import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

import type { ChatInputState } from './game/runtime/chatInput'
import { RatataGame } from './game/runtime/ratataGame'
import ChatInputOverlay from './game/ui/ChatInputOverlay.vue'
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
            <ChatInputOverlay v-if="chatInput.active" :state="chatInput" />
            <p v-if="errorMessage" class="game-error">{{ errorMessage }}</p>
        </section>
    </main>
</template>

<style scoped>
.app-shell {
    min-height: 100vh;
    background: linear-gradient(180deg, rgba(18, 24, 22, 0.9), rgba(10, 12, 11, 0.96)), #121816;
    color: #eef7ee;
}

.join-screen,
.game-screen {
    min-height: 100vh;
}

.join-screen {
    display: grid;
    place-items: center;
    padding: 24px;
}

.join-panel {
    width: min(420px, 100%);
    border: 1px solid rgba(238, 247, 238, 0.18);
    border-radius: 8px;
    background: rgba(15, 18, 17, 0.92);
    padding: 24px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}

.join-panel h1 {
    margin-bottom: 18px;
    color: #f8f1d5;
    font-size: 42px;
    font-weight: 800;
}

.join-panel label {
    display: block;
    margin-bottom: 8px;
    color: #b7cbb9;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
}

.join-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
}

.join-row input,
.join-row button {
    min-height: 42px;
    border-radius: 6px;
    font: inherit;
}

.join-row input {
    min-width: 0;
    border: 1px solid rgba(238, 247, 238, 0.24);
    background: #202621;
    color: #ffffff;
    padding: 0 12px;
}

.join-row button {
    border: 0;
    background: #d8b85f;
    color: #17130a;
    cursor: pointer;
    font-weight: 800;
    padding: 0 18px;
}

.join-row button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

.join-error,
.game-error {
    color: #ff8c7a;
    font-weight: 700;
}

.join-error {
    margin-top: 14px;
}

.game-screen {
    position: relative;
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
}

.hud {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid rgba(238, 247, 238, 0.14);
    background: rgba(11, 13, 12, 0.9);
    padding: 10px 14px;
}

.hud div {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.hud strong {
    color: #f8f1d5;
    font-weight: 800;
}

.hud span {
    color: #c5d7c8;
    font-size: 13px;
}

.game-host {
    min-height: 0;
    background: #0b0d0c;
    overflow: hidden;
}

:deep(.game-canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
    image-rendering: pixelated;
}

.game-error {
    position: fixed;
    right: 14px;
    bottom: 14px;
    z-index: 3;
    max-width: min(420px, calc(100vw - 28px));
    border-radius: 6px;
    background: rgba(40, 10, 8, 0.92);
    padding: 10px 12px;
}
</style>
