import type { CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'
import { type Ref, ref, watch } from 'vue'

interface LifeChoiceOptions {
    character: () => CharacterSnapshot | undefined
    connected: () => boolean
    send: (command: ClientMessage) => void
    newLife: () => void
    defeated: Ref<boolean>
}

/** A local choice only requests retirement; the server's permadeath event confirms it. */
export function useLifeChoice(options: LifeChoiceOptions) {
    const abandoning = ref(false)
    watch([() => options.character()?.alive, options.connected], ([alive, connected]) => {
        if (alive || !connected) abandoning.value = false
    })
    function abandonLife(): void {
        const character = options.character()
        if (!character || character.alive || character.life?.retired || abandoning.value) return
        if (!options.connected()) return
        abandoning.value = true
        options.send({ type: 'abandon_life' })
    }
    function confirmDeath(): void {
        if (abandoning.value) {
            abandoning.value = false
            options.newLife()
        } else options.defeated.value = true
    }
    return { abandoning, abandonLife, confirmDeath }
}
