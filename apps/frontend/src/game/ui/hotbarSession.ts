import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed, inject, type InjectionKey, provide, ref, watch } from 'vue'

import { defaultHotbarBindings, type HotbarBinding } from './hotbarBindings'

type Bindings = (HotbarBinding | null)[]
const sessionKey: InjectionKey<Map<string, Bindings>> = Symbol('hotbar session')

/** UI preferences live with this App instance, not the runtime socket or a future character. */
export function provideHotbarSession(): Map<string, Bindings> {
    const saved = new Map<string, Bindings>()
    provide(sessionKey, saved)
    return saved
}

export function useSavedHotbarBindings(player: () => CharacterSnapshot) {
    const saved = inject(sessionKey, undefined)
    const identity = computed(() => {
        const actor = player()
        return JSON.stringify([actor.id, actor.nickname, actor.heroClass, actor.visualId])
    })
    const load = () => copy(saved?.get(identity.value) ?? defaultHotbarBindings(player()))
    const bindings = ref<Bindings>(load())
    watch(
        identity,
        () => {
            bindings.value = load()
        },
        { flush: 'sync' }
    )
    watch(
        [bindings, () => player().life?.retired],
        () => {
            if (player().life?.retired) saved?.delete(identity.value)
            else saved?.set(identity.value, copy(bindings.value))
        },
        { deep: true, flush: 'sync' }
    )
    return bindings
}

function copy(bindings: Bindings): Bindings {
    return bindings.map((binding) => (binding === null ? null : { ...binding }))
}
