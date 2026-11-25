import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, onScopeDispose, type Ref, shallowRef, watchEffect } from 'vue'

import type { DialogueNeighbors } from '@/entities/dialogues'

interface SwitchOptions {
    snapshot: Readonly<Ref<WorldSnapshot | undefined>>
    player: Readonly<Ref<CharacterSnapshot | undefined>>
    connected: () => boolean
    blockedByOtherWindow: () => boolean
    neighbors: () => DialogueNeighbors
    isTargetAvailable: (key: string) => boolean
    send: (command: ClientMessage) => void
    openTarget: (key: string) => void
}

interface TargetSwitch {
    origin: WorldSnapshot
    locationId: string
    playerId: string
    npcId: string
    key: string
}

const SWITCH_TIMEOUT_MS = 3_000

export function useDialogueTargetSwitch(options: SwitchOptions) {
    const request = shallowRef<TargetSwitch>()
    const pending = computed(() => request.value !== undefined)
    let timer: ReturnType<typeof setTimeout> | undefined

    function cancel(): void {
        clearTimeout(timer)
        timer = undefined
        request.value = undefined
    }

    function switchTarget(key: string): boolean {
        if (pending.value) return false
        const context = readContext(options)
        if (!context?.dialogue) return false
        const { left, right } = options.neighbors()
        if ((left?.key !== key && right?.key !== key) || !options.isTargetAvailable(key))
            return false

        request.value = {
            origin: context.snapshot,
            locationId: context.locationId,
            playerId: context.playerId,
            npcId: context.dialogue.npcId,
            key,
        }
        timer = setTimeout(cancel, SWITCH_TIMEOUT_MS)
        options.send({ type: 'dialogue_choice', choiceId: 'close' })
        return true
    }

    watchEffect(
        () => {
            const active = request.value
            if (!active) return
            const context = readContext(options)
            if (
                !context ||
                context.playerId !== active.playerId ||
                context.locationId !== active.locationId ||
                context.snapshot.serverEpoch !== active.origin.serverEpoch ||
                context.snapshot.tick < active.origin.tick ||
                (context.dialogue && context.dialogue.npcId !== active.npcId) ||
                !options.isTargetAvailable(active.key)
            ) {
                cancel()
                return
            }

            if (context.snapshot === active.origin || context.dialogue !== null) return
            cancel()
            options.openTarget(active.key)
        },
        // Let the normal world-input blocked state reach GameplayOverlay before opening its menu.
        { flush: 'post' }
    )
    onScopeDispose(cancel)

    return { pending, switchTarget, cancel }
}

function readContext(options: SwitchOptions) {
    const snapshot = options.snapshot.value
    const player = availablePlayer(options)
    if (!snapshot || !snapshot.location || !snapshot.adventure || !player) return undefined

    const { dialogue, questBoard } = snapshot.adventure
    if (questBoard || dialogue?.kind === 'sign' || dialogue?.kind === 'quest_board')
        return undefined

    return { snapshot, playerId: player.id, locationId: snapshot.location.id, dialogue }
}

function availablePlayer(options: SwitchOptions): CharacterSnapshot | undefined {
    const player = options.player.value
    return options.connected() &&
        !options.blockedByOtherWindow() &&
        player?.alive &&
        !player.life?.retired &&
        player.cooldowns.stunMsLeft <= 0
        ? player
        : undefined
}
