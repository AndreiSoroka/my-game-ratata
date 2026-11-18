import type { CharacterSnapshot, HeroClass, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, type Ref } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
import { agentConnected } from './agentAvailability'
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
    setNickname: (name: string) => void
    game: Ref<RatataGame | undefined>
    joinGame: () => Promise<void>
    setInventory: (open: boolean) => void
}
export function useGameTestControls(state: TestControls) {
    const testState = computed<RatataTestState>(() => ({
        connected: agentConnected(state.status.value),
        mapReady: state.status.value === 'Connected',
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
                  observation: {
                      getBuildings: () => state.game.value?.getBuildings() ?? [],
                      isCharacterVisible: (id) => state.game.value?.isCharacterVisible(id) ?? false,
                      isPositionVisible: (point) =>
                          state.game.value?.isPositionVisible(point) ?? false,
                      isInteractionVisible: (point, bounds, range) =>
                          state.game.value?.isInteractionVisible(point, bounds, range) ?? false,
                  },
                  inventory: (open) => state.setInventory(open ?? !state.inventoryOpen.value),
                  join: async (name, selectedClass) => {
                      if (state.isStarted.value) throw new Error('A game is already running')
                      if (name.trim().length === 0 || name.trim().length > 24)
                          throw new Error('Nickname must contain 1–24 characters')
                      state.heroClass.value = selectedClass ?? state.heroClass.value
                      state.setNickname(name.trim())
                      await state.joinGame()
                  },
                  send: (command) => state.game.value?.sendCommand(command),
              })
            : undefined
    return { testState, testInterface }
}
