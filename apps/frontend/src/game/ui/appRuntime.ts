import type { HeroClass, WorldSnapshot } from '@my-game-ratata/contracts'
import { nextTick, type Ref, toRaw } from 'vue'

import type { ChatInputState } from '../runtime/chatInput'
import { RatataGame } from '../runtime/ratataGame'
import type GameplayOverlay from './GameplayOverlay.vue'
import type { createTransientNotices } from './transientNotices'

interface AppRuntimeOptions {
    game: Ref<RatataGame | undefined>
    container: () => HTMLElement | undefined
    nickname: string
    heroClass: HeroClass
    gameplay: () => InstanceType<typeof GameplayOverlay> | undefined
    chatInput: Ref<ChatInputState>
    errorMessage: Ref<string>
    snapshot: Ref<WorldSnapshot | undefined>
    localPlayerId: Ref<string | undefined>
    isJoining: Ref<boolean>
    isStarted: Ref<boolean>
    status: Ref<string>
    notices: ReturnType<typeof createTransientNotices>
    confirmDeath: () => void
    cleanupFailedJoin: () => void
    openNearbyMenu: (id?: string) => void
    toggleInventory: () => void
}
export async function startAppRuntime(options: AppRuntimeOptions): Promise<void> {
    options.errorMessage.value = ''
    options.isJoining.value = true
    options.isStarted.value = true
    await nextTick()
    const container = options.container()
    if (!container) {
        options.errorMessage.value = 'Game surface is not ready'
        options.cleanupFailedJoin()
        return
    }
    const runtime = createAppRuntime(options, container)
    options.game.value = runtime
    await runtime.start().catch((error: unknown) => {
        if (toRaw(options.game.value) !== runtime) return
        options.errorMessage.value = error instanceof Error ? error.message : 'Game failed to start'
        options.cleanupFailedJoin()
    })
}

function createAppRuntime(options: AppRuntimeOptions, container: HTMLElement): RatataGame {
    return new RatataGame({
        container,
        nickname: options.nickname.trim(),
        heroClass: options.heroClass,
        onDefeat: options.confirmDeath,
        onChatState: (state) => {
            options.chatInput.value = state
        },
        onError: (message) => {
            options.errorMessage.value = message
            options.cleanupFailedJoin()
        },
        onNotice: options.notices.show,
        onContextAction: () => options.openNearbyMenu(options.gameplay()?.selectedId),
        onCharacterClick: (id) => options.gameplay()?.select(id, true),
        onEvent: (event) => options.gameplay()?.receive(event),
        onInventoryToggle: options.toggleInventory,
        onSnapshot: (snapshot, playerId) => {
            if (options.localPlayerId.value !== playerId) options.notices.reset()
            options.notices.observe('adventure', snapshot.adventure)
            options.notices.observe('party', snapshot.party)
            options.snapshot.value = snapshot
            options.localPlayerId.value = playerId
            options.isJoining.value = false
        },
        onStatus: (status) => {
            options.status.value = status
        },
    })
}
