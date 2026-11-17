import type { GameCharacter } from './character'

const listeners = new WeakMap<GameCharacter, Set<() => void>>()

export function onCharacterDeath(
    actor: GameCharacter,
    callback: () => void
): () => void {
    const callbacks = listeners.get(actor) ?? new Set()
    callbacks.add(callback)
    listeners.set(actor, callbacks)
    return () => {
        callbacks.delete(callback)
    }
}

/** Resolve promises before any death loot can inspect or drain possessions. */
export function notifyCharacterDeath(actor: GameCharacter): void {
    for (const callback of [...(listeners.get(actor) ?? [])]) {
        callback()
    }
}
