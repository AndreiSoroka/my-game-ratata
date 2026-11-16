import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { nextTick, onBeforeUnmount, type Ref } from 'vue'

import type { ChatInputState } from '../runtime/chatInput'
import type { RatataGame } from '../runtime/ratataGame'
import type AutomationPanels from './AutomationPanels.vue'
import { recoverFailedJoin } from './failedJoin'
import type { TransientNotices } from './transientNotices'

interface AppSessionOptions {
    gameMenu: { open: Ref<boolean> }
    characterOpen?: Ref<boolean>
    automationPanels: Ref<InstanceType<typeof AutomationPanels> | undefined>
    notices: TransientNotices
    hotbarSession: { clear: () => void }
    testInterface: { api: { stop: () => void }; dispose: () => void } | undefined
    defeated: Ref<boolean>
    errorMessage: Ref<string>
    isJoining: Ref<boolean>
    localPlayerId: Ref<string | undefined>
    game: Ref<RatataGame | undefined>
    snapshot: Ref<WorldSnapshot | undefined>
    inventoryOpen: Ref<boolean>
    planting: Ref<boolean>
    chatInput: Ref<ChatInputState>
    isStarted: Ref<boolean>
    status: Ref<string>
}
export function useAppSession(options: AppSessionOptions) {
    function resetGameSession(): void {
        options.gameMenu.open.value = false
        if (options.characterOpen) options.characterOpen.value = false
        options.automationPanels.value?.close()
        options.notices.reset()
        options.game.value?.stop()
        options.game.value = undefined
        options.snapshot.value = undefined
        options.localPlayerId.value = undefined
        options.inventoryOpen.value = false
        options.planting.value = false
        options.chatInput.value = { active: false, draft: '', maxLength: 100 }
        options.isStarted.value = false
        options.isJoining.value = false
        options.status.value = 'Ready'
    }
    function leaveSession(focusId: string): void {
        if (focusId === 'hero-class') options.hotbarSession.clear()
        options.testInterface?.api.stop()
        resetGameSession()
        options.defeated.value = false
        options.errorMessage.value = ''
        void nextTick(() => document.getElementById(focusId)?.focus())
    }
    onBeforeUnmount(() => {
        options.notices.reset()
        options.testInterface?.dispose()
        options.game.value?.stop()
    })
    return {
        leaveSession,
        cleanupFailedJoin: () =>
            recoverFailedJoin(options.isJoining, options.localPlayerId.value, resetGameSession),
    }
}
