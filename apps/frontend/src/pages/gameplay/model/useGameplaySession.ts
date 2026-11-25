import type { HeroClass, WorldSnapshot } from '@my-game-ratata/contracts'
import { type Ref, ref } from 'vue'

import { heroClassTheme } from '@/entities/character-window'
import { provideDarkPanelTheme } from '@/shared/ui/theme'

import { useHeroName } from '../../../game/names/useHeroName'
import type { RatataGame } from '../../../game/runtime/ratataGame'
import { useGameTestControls } from '../../../game/testing/useGameTestControls'
import type GameplayOverlay from '../ui/GameplayOverlay.vue'
import type GameWindows from '../ui/GameWindows.vue'
import type NearbyInteraction from '../ui/NearbyInteraction.vue'
import { startAppRuntime } from './appRuntime'
import { provideHotbarSession } from './hotbarSession'
import { createTransientNotices } from './transientNotices'
import { useAppChat } from './useAppChat'
import { useAppSession } from './useAppSession'
import { useAppWindows } from './useAppWindows'
import { useCharacterApproach } from './useCharacterApproach'
import { useCharacterViews } from './useCharacterViews'
import { useChestSession } from './useChestSession'
import { useInventoryUi } from './useInventoryUi'
import { useLifeChoice } from './useLifeChoice'

export function useGameplaySession(isStarted: Ref<boolean>, canEnterWorld: () => Promise<boolean>) {
    const state = useGameplayState(isStarted)
    const { game, snapshot, localCharacter, heroName, heroClass } = state
    const inventory = useGameplayInventory(state, () => windows.automationPanels.value?.close())
    const life = useLifeChoice({
        character: () => localCharacter.value,
        connected: () => state.status.value === 'Connected',
        send: (command) => game.value?.sendCommand(command),
        newLife: () => leaveSession('hero-class'),
        defeated: state.defeated,
    })
    const windows = useAppWindows({
        ...state,
        ...inventory,
        characterId: () => localCharacter.value?.id,
        social: state.gameWindows,
        toggleInventory: inventory.toggleInventory,
        leave: () => leaveSession('nickname'),
    })
    const test = useGameTestControls({
        ...state,
        ...inventory,
        setNickname: heroName.setManually,
        joinGame,
    })
    const { leaveSession, cleanupFailedJoin } = useAppSession({
        ...state,
        ...inventory,
        ...windows,
        testInterface: test.testInterface,
    })
    const characterApproach = useCharacterApproach({
        game,
        snapshot,
        player: () => localCharacter.value,
        selectedId: () => state.gameplay.value?.selectedId,
        blocked: () => windows.worldInputBlocked.value || inventory.planting.value,
        select: (id) => state.gameplay.value?.select(id) ?? false,
        canOpen: (id) => state.interaction.value?.canOpenFor(`character:${id}`) ?? false,
        open: windows.openNearbyMenu,
    })

    async function joinGame(): Promise<void> {
        if (!(await canEnterWorld())) return
        await startAppRuntime({
            ...state,
            ...heroName.attempt(),
            heroClass: heroClass.value,
            container: () => state.gameHost.value,
            gameplay: () => state.gameplay.value,
            characterApproach,
            confirmDeath: life.confirmDeath,
            cleanupFailedJoin,
            ...windows,
        })
    }
    const { canSelectTarget, isPositionVisible } = windows.dialogueSwitch
    return {
        ...state,
        ...inventory,
        ...test,
        ...life,
        windows,
        gameMenu: windows.gameMenu,
        automationPanels: windows.automationPanels,
        worldInputBlocked: windows.worldInputBlocked,
        prepareAutomationWindow: windows.prepareAutomationWindow,
        canSelectTarget,
        isPositionVisible,
        selectTarget: (key: string) => state.gameplay.value?.selectKey(key) ?? false,
        leaveSession,
        joinGame,
    }
}

function useGameplayState(isStarted: Ref<boolean>) {
    const game = ref<RatataGame>()
    const snapshot = ref<WorldSnapshot>()
    const localPlayerId = ref<string>()
    const notice = ref('')
    const errorMessage = ref('')
    const { nickname, ...heroName } = useHeroName(undefined, () => (errorMessage.value = ''))
    const { localCharacter, visibleCharacters } = useCharacterViews(snapshot, game, localPlayerId)
    provideDarkPanelTheme(() => heroClassTheme(localCharacter.value?.heroClass))
    return {
        game,
        snapshot,
        localPlayerId,
        notice,
        errorMessage,
        nickname,
        heroName,
        localCharacter,
        visibleCharacters,
        isStarted,
        heroClass: ref<HeroClass>('vanguard'),
        defeated: ref(false),
        isJoining: ref(false),
        status: ref('Ready'),
        gameHost: ref<HTMLElement>(),
        gameplay: ref<InstanceType<typeof GameplayOverlay>>(),
        interaction: ref<InstanceType<typeof NearbyInteraction>>(),
        gameWindows: ref<InstanceType<typeof GameWindows>>(),
        notices: createTransientNotices((text) => (notice.value = text)),
        hotbarSession: provideHotbarSession(),
        ...useAppChat(snapshot, localPlayerId),
    }
}

function useGameplayInventory(
    state: ReturnType<typeof useGameplayState>,
    closeAutomation: () => void
) {
    const { game, localCharacter, status, snapshot } = state
    const inventory = useInventoryUi(
        () => game.value,
        () => closeChest()
    )
    const {
        chest,
        close: closeChest,
        pending: chestPending,
    } = useChestSession({
        snapshot,
        player: localCharacter,
        connected: () => status.value === 'Connected',
        send: (command) => game.value?.sendCommand(command),
        onOpen: () => {
            closeAutomation()
            inventory.inventoryOpen.value = false
            if (snapshot.value?.adventure?.dialogue)
                game.value?.sendCommand({ type: 'dialogue_choice', choiceId: 'close' })
        },
    })
    return { ...inventory, chest, closeChest, chestPending }
}
