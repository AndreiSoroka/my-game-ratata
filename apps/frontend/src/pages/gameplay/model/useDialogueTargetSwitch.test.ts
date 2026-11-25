import {
    type AdventureDialogue,
    CENTER_LOCATION_ID,
    type ClientMessage,
    WORLD_LOCATION_DEFINITIONS,
    type WorldLocation,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import {
    adventureFixture,
    characterFixture,
    worldFixture,
} from '../../../game/testing/characterFixture'
import { useDialogueTargetSwitch } from './useDialogueTargetSwitch'

const merchant: AdventureDialogue = {
    npcId: 'merchant',
    npcName: 'Mira',
    title: 'Shop',
    kind: 'conversation',
    initialView: 'shop',
    canTrade: true,
    choices: [],
    text: '',
}
const neighbor = { key: 'character:neighbor', name: 'Neighbor' }
const anotherLocation = WORLD_LOCATION_DEFINITIONS.find(({ id }) => id !== CENTER_LOCATION_ID)!

function setup() {
    const scope = effectScope()
    const player = ref(characterFixture('self'))
    const snapshot = ref<WorldSnapshot>({
        ...worldFixture([player.value]),
        adventure: { ...adventureFixture(), dialogue: merchant },
        location: { id: CENTER_LOCATION_ID } as WorldLocation,
        serverEpoch: 'server-1',
    })
    const connected = ref(true)
    const otherWindow = ref(false)
    const available = ref(true)
    const send = vi.fn<(command: ClientMessage) => void>()
    const openTarget = vi.fn<(key: string) => void>()
    const handoff = scope.run(() =>
        useDialogueTargetSwitch({
            snapshot,
            player,
            connected: () => connected.value,
            blockedByOtherWindow: () => otherWindow.value,
            neighbors: () => ({ right: neighbor }),
            isTargetAvailable: (key) => available.value && key === neighbor.key,
            send,
            openTarget,
        })
    )!

    function advance(overrides: Partial<WorldSnapshot> = {}): void {
        const previous = snapshot.value
        snapshot.value = { ...previous, tick: previous.tick + 1, ...overrides }
    }

    function closeDialogue(): void {
        advance({ adventure: { ...adventureFixture(), dialogue: null } })
    }

    return {
        scope,
        player,
        snapshot,
        connected,
        otherWindow,
        available,
        send,
        openTarget,
        advance,
        closeDialogue,
        ...handoff,
    }
}

describe('switching targets from an NPC dialogue', () => {
    let state: ReturnType<typeof setup>

    beforeEach(() => {
        vi.useFakeTimers()
        state = setup()
    })
    afterEach(() => {
        state.scope.stop()
        vi.useRealTimers()
    })

    it('waits for a new server snapshot to close the NPC session, then opens the exact target once', async () => {
        expect(state.switchTarget('character:unknown')).toBe(false)
        expect(state.switchTarget(neighbor.key)).toBe(true)
        expect(state.switchTarget(neighbor.key)).toBe(false)
        expect(state.pending.value).toBe(true)
        expect(state.send.mock.calls).toEqual([[{ type: 'dialogue_choice', choiceId: 'close' }]])

        state.advance()
        await nextTick()
        expect(state.pending.value).toBe(true)
        expect(state.openTarget).not.toHaveBeenCalled()

        state.closeDialogue()
        await nextTick()
        expect(state.pending.value).toBe(false)
        expect(state.openTarget.mock.calls).toEqual([[neighbor.key]])

        state.advance()
        await nextTick()
        expect(state.openTarget).toHaveBeenCalledOnce()
    })

    it('discards the request if the target is unreachable at acknowledgement', async () => {
        expect(state.switchTarget(neighbor.key)).toBe(true)
        state.closeDialogue()
        state.available.value = false
        await nextTick()

        expect(state.pending.value).toBe(false)
        expect(state.openTarget).not.toHaveBeenCalled()
        state.available.value = true
        state.advance()
        await nextTick()
        expect(state.openTarget).not.toHaveBeenCalled()
    })

    it.each([
        [
            'opening another window',
            (): void => {
                state.otherWindow.value = true
            },
        ],
        [
            'disconnecting',
            (): void => {
                state.connected.value = false
            },
        ],
        [
            'dying',
            (): void => {
                state.player.value.alive = false
            },
        ],
        [
            'replacing the player identity',
            (): void => {
                state.player.value = characterFixture('new')
            },
        ],
        [
            'leaving the location',
            () => state.advance({ location: anotherLocation as WorldLocation }),
        ],
        ['changing the server session', () => state.advance({ serverEpoch: 'server-2' })],
        ['receiving an older world state', () => state.advance({ tick: 0 })],
        [
            'changing the current NPC',
            () =>
                state.advance({
                    adventure: { ...adventureFixture(), dialogue: { ...merchant, npcId: 'other' } },
                }),
        ],
        [
            'opening the quest board',
            () =>
                state.advance({
                    adventure: {
                        ...adventureFixture(),
                        questBoard: { objectId: 'board', entries: [] },
                    },
                }),
        ],
    ] as const)('cancels the handoff when %s', async (_condition, interrupt) => {
        expect(state.switchTarget(neighbor.key)).toBe(true)
        interrupt()
        await nextTick()
        expect(state.pending.value).toBe(false)

        state.closeDialogue()
        await nextTick()
        expect(state.openTarget).not.toHaveBeenCalled()
    })

    it('ignores a late acknowledgement after the three-second timeout', async () => {
        expect(state.switchTarget(neighbor.key)).toBe(true)
        vi.advanceTimersByTime(2_999)
        expect(state.pending.value).toBe(true)
        vi.advanceTimersByTime(1)
        expect(state.pending.value).toBe(false)

        state.closeDialogue()
        await nextTick()
        expect(state.openTarget).not.toHaveBeenCalled()
    })

    it('clears the timeout when the client scope is disposed', async () => {
        expect(state.switchTarget(neighbor.key)).toBe(true)
        state.scope.stop()
        expect(state.pending.value).toBe(false)
        expect(vi.getTimerCount()).toBe(0)

        state.closeDialogue()
        await nextTick()
        expect(state.openTarget).not.toHaveBeenCalled()
    })
})
