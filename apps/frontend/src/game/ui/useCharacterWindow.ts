import { computed, nextTick, ref, watch } from 'vue'

import type { CharacterTab } from '@/entities/character-window'

import type { RatataGame } from '../runtime/ratataGame'

export function useCharacterWindow(options: {
    available: () => boolean
    identity: () => string | undefined
    game: () => RatataGame | undefined
    prepare: (wasOpen: boolean) => void
}) {
    const characterOpen = ref(false)
    const characterTab = ref<CharacterTab>('stats')
    watch(options.identity, () => {
        characterTab.value = 'stats'
        characterOpen.value = false
    })
    function openCharacter(): void {
        if (!options.available()) return
        const wasOpen = characterOpen.value
        options.prepare(wasOpen)
        const game = options.game()
        game?.cancelChat()
        game?.releaseUiControls()
        characterOpen.value = true
        if (!wasOpen) game?.playUiSound('uiOpen')
    }
    function closeCharacter(): void {
        const wasOpen = characterOpen.value
        const game = options.game()
        game?.releaseUiControls()
        characterOpen.value = false
        if (wasOpen) game?.playUiSound('uiBookClose')
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
            const game = options.game()
            game?.releaseUiControls()
            if (characterTab.value === value) return
            characterTab.value = value
            if (characterOpen.value) game?.playUiSound('uiSelect')
        },
        toggleCharacter: () => (characterOpen.value ? closeCharacter() : openCharacter()),
    }
}
