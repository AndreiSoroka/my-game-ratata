import type { GameCharacter } from './character'
import { companionProfiles } from './companionProfiles'

/** Explicit intentions may use combat even when the scripted companion avoids it. */
export function canUseCombat(actor: GameCharacter): boolean {
    const profile = companionProfiles[actor.id]
    return (
        profile?.combatEnabled ??
        (profile?.canFight !== false &&
            actor.soul.companion?.canFight !== false)
    )
}

/** Low-level combat retains the runtime guard for callers outside agent control. */
export function allowsSharedCombat(actor: GameCharacter): boolean {
    return (
        companionProfiles[actor.id]?.combatEnabled ??
        actor.soul.companion?.canFight !== false
    )
}
