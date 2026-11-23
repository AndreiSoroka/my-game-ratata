import type { AbilityId, CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed, inject, type InjectionKey, provide, type Ref, ref, shallowRef, watch } from 'vue'

import type { HotbarBinding } from './hotbarBindings'

type Bindings = (HotbarBinding | null)[]
interface HotbarSessionEntry {
    bindings: Ref<Bindings>
    seen: Set<AbilityId>
}

const sessionKey: InjectionKey<Map<string, HotbarSessionEntry>> = Symbol('hotbar session')

/** UI preferences live with this App instance, not the runtime socket or a future character. */
export function provideHotbarSession(): Map<string, HotbarSessionEntry> {
    const saved = new Map<string, HotbarSessionEntry>()
    provide(sessionKey, saved)
    return saved
}

export function useSavedHotbarBindings(player: () => CharacterSnapshot) {
    const saved = inject(sessionKey, undefined) ?? new Map<string, HotbarSessionEntry>()
    const active = shallowRef<HotbarSessionEntry>()
    let activeKey: string | undefined
    watch(
        () => {
            const actor = player()
            return [hotbarIdentityKey(actor), actor.abilities?.known, actor.life?.retired] as const
        },
        ([key, known, retired]) => {
            const attached = key === activeKey ? active.value : undefined
            const entry = attached ?? saved.get(key) ?? createEntry()
            if (retired) {
                saved.delete(key)
            } else {
                if (!attached) saved.set(key, entry)
                // Final defeat can clear the session before the retired snapshot arrives.
                if (saved.get(key) === entry) assignNewAbilities(entry, known)
            }
            activeKey = key
            active.value = entry
        },
        { immediate: true, flush: 'sync' }
    )
    return computed(() => active.value!.bindings.value)
}

function createEntry(): HotbarSessionEntry {
    return { bindings: ref([{ kind: 'attack' }, null, null, null]), seen: new Set() }
}

function assignNewAbilities(entry: HotbarSessionEntry, known: readonly AbilityId[] = []): void {
    let updated: Bindings | undefined
    for (const id of known) {
        if (entry.seen.has(id)) continue
        entry.seen.add(id)
        const bindings = updated ?? entry.bindings.value
        const index = bindings.indexOf(null)
        if (
            index === -1 ||
            bindings.some((binding) => binding?.kind === 'ability' && binding.id === id)
        )
            continue
        updated ??= [...bindings]
        updated[index] = { kind: 'ability', id }
    }
    if (updated) entry.bindings.value = updated
}

export function hotbarIdentityKey(actor: CharacterSnapshot): string {
    return JSON.stringify([actor.id, actor.nickname, actor.heroClass, actor.visualId])
}
