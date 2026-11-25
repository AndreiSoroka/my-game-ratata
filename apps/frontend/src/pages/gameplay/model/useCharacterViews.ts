import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, type Ref } from 'vue'

import type { RatataGame } from '../../../game/runtime/ratataGame'

export function useCharacterViews(
    snapshot: Ref<WorldSnapshot | undefined>,
    game: Ref<RatataGame | undefined>,
    localPlayerId: Ref<string | undefined>
) {
    const localCharacter = computed(() =>
        snapshot.value?.characters.find((character) => character.id === localPlayerId.value)
    )
    const visibleCharacters = computed(
        () =>
            snapshot.value?.characters.filter(
                (character) => game.value?.isCharacterVisible(character.id) ?? true
            ) ?? []
    )
    return { localCharacter, visibleCharacters }
}
