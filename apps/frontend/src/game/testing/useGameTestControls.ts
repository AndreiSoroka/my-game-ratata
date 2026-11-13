import type { CharacterSnapshot, HeroClass, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, type Ref } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
import { installTestInterface, type RatataTestState } from './testInterface'

interface TestControls {
    status: Ref<string>
    defeated: Ref<boolean>
    errorMessage: Ref<string>
    inventoryOpen: Ref<boolean>
    localPlayerId: Ref<string | undefined>
    snapshot: Ref<WorldSnapshot | undefined>
    notice: Ref<string>
    localCharacter: Ref<CharacterSnapshot | undefined>
    isStarted: Ref<boolean>
    heroClass: Ref<HeroClass>
    nickname: Ref<string>
    game: Ref<RatataGame | undefined>
    joinGame: () => Promise<void>
    setInventory: (open: boolean) => void
}
export function useGameTestControls(state: TestControls) {
    const testState = computed<RatataTestState>(() => ({
        connected: state.status.value === 'Connected',
        defeated: state.defeated.value,
        error: state.errorMessage.value,
        inventoryOpen: state.inventoryOpen.value,
        localPlayerId: state.localPlayerId.value,
        location: state.snapshot.value?.location,
        notice: state.notice.value,
        player: state.localCharacter.value,
        snapshot: state.snapshot.value,
        status: state.status.value,
    }))
    const testInterface =
        new URLSearchParams(window.location.search).get('test') === '1'
            ? installTestInterface({
                  getState: () => testState.value,
                  inventory: (open) => state.setInventory(open ?? !state.inventoryOpen.value),
                  join: async (name, selectedClass) => {
                      if (state.isStarted.value) throw new Error('A game is already running')
                      if (name.trim().length === 0 || name.trim().length > 24)
                          throw new Error('Nickname must contain 1–24 characters')
                      state.heroClass.value = selectedClass ?? state.heroClass.value
                      state.nickname.value = name.trim()
                      await state.joinGame()
                  },
                  send: (command) => state.game.value?.sendCommand(command),
              })
            : undefined
    return { testState, testInterface }
}
