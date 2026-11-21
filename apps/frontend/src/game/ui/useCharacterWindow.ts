import { computed, nextTick, ref, watch } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'

export type CharacterTab = 'stats' | 'development' | 'quests' | 'crafting'

export function useCharacterWindow(options: {
    available: () => boolean
    identity: () => string | undefined
    game: () => RatataGame | undefined
    prepare: () => void
}) {
    const characterOpen = ref(false)
    const characterTab = ref<CharacterTab>('stats')
    watch(options.identity, () => {
        characterTab.value = 'stats'
        characterOpen.value = false
    })
    function openCharacter(): void {
        if (!options.available()) return
        options.prepare()
        options.game()?.cancelChat()
        options.game()?.releaseUiControls()
        characterOpen.value = true
    }
    function closeCharacter(): void {
        options.game()?.releaseUiControls()
        characterOpen.value = false
        void nextTick(() =>
            (
                document.querySelector<HTMLElement>('[role="alertdialog"] [tabindex="-1"]') ??
                document.querySelector<HTMLCanvasElement>('[data-game-canvas]')
            )?.focus()
        )
    }
    return {
        characterOpen,
        characterModal: computed(() => characterOpen.value && characterTab.value !== 'quests'),
        characterTab,
        openCharacter,
        closeCharacter,
        setCharacterTab: (value: CharacterTab) => {
            options.game()?.releaseUiControls()
            characterTab.value = value
        },
        toggleCharacter: () => (characterOpen.value ? closeCharacter() : openCharacter()),
    }
}
