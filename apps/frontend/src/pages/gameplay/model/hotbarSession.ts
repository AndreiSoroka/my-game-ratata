import { type AbilityId, abilityIds, type CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed, inject, type InjectionKey, provide, type Ref, ref, shallowRef, watch } from 'vue'

import type { HotbarBinding } from './hotbarBindings'

interface HotbarPreset {
    bindings: (HotbarBinding | null)[]
    seen: AbilityId[]
}

const sessionKey: InjectionKey<ReturnType<typeof createHotbarSession>> = Symbol('hotbar session')
const storagePrefix = 'ratata:hotbar:v1:'

/** A server identity keeps its preset across reconnects and page reloads in this tab. */
export function provideHotbarSession(serverEpoch?: () => string | undefined) {
    const session = createHotbarSession(serverEpoch)
    provide(sessionKey, session)
    return session
}

function createHotbarSession(serverEpoch?: () => string | undefined) {
    const entries = new Map<string, Ref<HotbarPreset>>()
    const forget = (key: string) => {
        entries.delete(key)
        writePreset(key, undefined)
    }
    return {
        entries,
        identity: (actor: CharacterSnapshot) => {
            const epoch = serverEpoch?.()
            return epoch
                ? `${storagePrefix}${JSON.stringify([epoch, actor.id])}`
                : JSON.stringify([actor.id, actor.nickname, actor.heroClass, actor.visualId])
        },
        forget,
        clear: () => {
            for (const key of entries.keys()) forget(key)
        },
    }
}

export function useSavedHotbarBindings(player: () => CharacterSnapshot) {
    const session = inject(sessionKey, undefined) ?? createHotbarSession()
    const active = shallowRef<Ref<HotbarPreset>>()
    const identity = computed(() => session.identity(player()))
    let activeKey: string | undefined
    watch(
        () => active.value?.value,
        (preset) => {
            if (activeKey && session.entries.get(activeKey) === active.value)
                writePreset(activeKey, preset)
        },
        { deep: true, flush: 'sync' }
    )
    watch(
        [identity, () => player().abilities?.known, () => player().life?.retired],
        ([key, known, retired]) => {
            const attached = key === activeKey ? active.value : undefined
            const entry =
                attached ?? session.entries.get(key) ?? ref(readPreset(key) ?? freshPreset())
            if (retired) {
                session.forget(key)
            } else {
                if (!attached) session.entries.set(key, entry)
                // Final defeat can clear the session before the retired snapshot arrives.
                if (session.entries.get(key) === entry) assignNewAbilities(entry, known)
            }
            activeKey = key
            active.value = entry
        },
        // The server epoch and the player props must both come from the new snapshot.
        { immediate: true }
    )
    return { identity, bindings: computed(() => active.value!.value.bindings) }
}

function freshPreset(): HotbarPreset {
    return { bindings: [{ kind: 'attack' }, null, null, null], seen: [] }
}

function assignNewAbilities(entry: Ref<HotbarPreset>, known: readonly AbilityId[] = []): void {
    if (known.every((id) => entry.value.seen.includes(id))) return
    const seen = new Set(entry.value.seen)
    const bindings = [...entry.value.bindings]
    for (const id of known) {
        if (seen.has(id)) continue
        seen.add(id)
        const index = bindings.indexOf(null)
        if (
            index !== -1 &&
            !bindings.some((binding) => binding?.kind === 'ability' && binding.id === id)
        )
            bindings[index] = { kind: 'ability', id }
    }
    entry.value = { bindings, seen: [...seen] }
}

function readPreset(key: string): HotbarPreset | undefined {
    if (!key.startsWith(storagePrefix)) return
    try {
        const raw = window.sessionStorage.getItem(key)
        if (!raw) return
        const value: unknown = JSON.parse(raw)
        if (
            isRecord(value) &&
            Array.isArray(value.bindings) &&
            value.bindings.length === 4 &&
            value.bindings.every(isBinding) &&
            Array.isArray(value.seen) &&
            value.seen.every(isAbility)
        )
            return { bindings: value.bindings, seen: value.seen }
    } catch {
        // Keep the in-memory hotbar when browser storage is unavailable or invalid.
    }
}

function writePreset(key: string, preset: HotbarPreset | undefined): void {
    if (!key.startsWith(storagePrefix)) return
    try {
        if (preset) window.sessionStorage.setItem(key, JSON.stringify(preset))
        else window.sessionStorage.removeItem(key)
    } catch {
        // The hotbar stays usable when browser storage is unavailable or full.
    }
}

function isBinding(value: unknown): value is HotbarBinding | null {
    return (
        value === null ||
        (isRecord(value) &&
            (value.kind === 'attack' ||
                (value.kind === 'ability' && isAbility(value.id)) ||
                (value.kind === 'item' && (value.id === 'food' || value.id === 'sapling'))))
    )
}

function isAbility(value: unknown): value is AbilityId {
    return typeof value === 'string' && (abilityIds as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}
