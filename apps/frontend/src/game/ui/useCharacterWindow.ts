import { nextTick, ref, watch } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'

export function useCharacterWindow(options: {
    available: () => boolean
    identity: () => string | undefined
    game: () => RatataGame | undefined
    prepare: () => void
}) {
    const characterOpen = ref(false)
    const characterTab = ref<'stats' | 'development'>('stats')
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
        characterOpen.value = false
        void nextTick(() =>
            (
                document.querySelector<HTMLElement>('[role="alertdialog"] [tabindex="-1"]') ??
                document.querySelector<HTMLCanvasElement>('[data-game-canvas]')
            )?.focus()
        )
    }
    function openDevelopment(): void {
        characterTab.value = 'development'
        openCharacter()
    }
    return {
        characterOpen,
        characterTab,
        openCharacter,
        closeCharacter,
        openDevelopment,
        setCharacterTab: (value: 'stats' | 'development') => {
            characterTab.value = value
        },
        toggleCharacter: () => (characterOpen.value ? closeCharacter() : openCharacter()),
    }
}
