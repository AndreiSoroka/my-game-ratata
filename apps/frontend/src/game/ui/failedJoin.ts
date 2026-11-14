import type { Ref } from 'vue'

/** A failed initial join releases the runtime; errors after joining retain the current identity. */
export function recoverFailedJoin(
    joining: Ref<boolean>,
    playerId: string | undefined,
    reset: () => void
): void {
    if (playerId === undefined) reset()
    else joining.value = false
}
