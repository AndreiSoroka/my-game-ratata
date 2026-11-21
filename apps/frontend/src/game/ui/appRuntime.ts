import type { HeroClass, WorldSnapshot } from '@my-game-ratata/contracts'
import { nextTick, type Ref, toRaw } from 'vue'

import type { ChatInputState } from '../runtime/chatInput'
import { RatataGame } from '../runtime/ratataGame'
import { createConstellationNotices } from './constellationNotices'
import type GameplayOverlay from './GameplayOverlay.vue'
import type { createTransientNotices } from './transientNotices'

interface AppRuntimeOptions {
    game: Ref<RatataGame | undefined>
    container: () => HTMLElement | undefined
    nickname: string
    createOnly?: boolean
    onJoinAccepted?: () => void
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
    hotbarSession?: { clear: () => void }
    cleanupFailedJoin: () => void
    openNearbyMenu: (id?: string) => void
    characterApproach?: ReturnType<typeof import('./useCharacterApproach').useCharacterApproach>
    toggleInventory: () => void
    toggleCharacter?: () => void
    chatHistory?: ReturnType<typeof import('./chatHistory').createChatHistory>
}
export async function startAppRuntime(options: AppRuntimeOptions): Promise<void> {
    if (options.nickname.trim().length === 0 || options.isJoining.value) return
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
    const constellations = createConstellationNotices()
    let noticeSession = ''
    let accepted = false
    return new RatataGame({
        container,
        nickname: options.nickname.trim(),
        ...(options.createOnly === true ? { createOnly: true } : {}),
        heroClass: options.heroClass,
        onDefeat: () => {
            options.hotbarSession?.clear()
            options.confirmDeath()
        },
        onChatState: (state) => {
            options.chatInput.value = state
        },
        onError: (message) => {
            options.errorMessage.value = message
            options.cleanupFailedJoin()
        },
        onMapError: (message) => {
            options.errorMessage.value = message ?? ''
        },
        onNotice: options.notices.show,
        onContextAction: () => options.openNearbyMenu(options.gameplay()?.selectedId),
        getChatTargetId: () => options.gameplay()?.selectedId,
        getChatFocusKey: () => options.gameplay()?.selectedKey,
        onCharacterClick: (id) => {
            const gameplay = options.gameplay()
            if (gameplay?.selectedId !== id) options.characterApproach?.stop()
            gameplay?.select(id)
        },
        onCharacterDoubleClick: (id) => void options.characterApproach?.begin(id),
        onCommand: options.characterApproach?.command,
        onEvent: (event) => {
            options.chatHistory?.event(event)
            options.gameplay()?.receive(event)
        },
        onInventoryToggle: options.toggleInventory,
        onCharacterToggle: options.toggleCharacter,
        onSnapshot: (snapshot, playerId) => {
            if (!accepted && snapshot.characters.some((character) => character.id === playerId)) {
                accepted = true
                options.onJoinAccepted?.()
            }
            options.chatHistory?.observe(snapshot, playerId)
            const session = JSON.stringify([snapshot.serverEpoch ?? '', playerId])
            if (session !== noticeSession) {
                noticeSession = session
                options.notices.reset()
            }
            options.notices.observe('adventure', snapshot.adventure)
            options.notices.observe('party', snapshot.party)
            const exchange = snapshot.social?.exchange
            if (exchange?.status === 'completed' && exchange.receiptId)
                options.notices.observe('exchange', {
                    notice: 'Обмен завершён.',
                    noticeId: exchange.receiptId,
                })
            options.notices.observe('constellations', constellations.observe(snapshot, playerId))
            options.snapshot.value = snapshot
            options.localPlayerId.value = playerId
            options.isJoining.value = false
        },
        onStatus: (status) => {
            options.status.value = status
        },
    })
}
