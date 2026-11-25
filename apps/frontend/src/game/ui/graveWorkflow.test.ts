import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import ActionHotbar from '../../pages/gameplay/ui/ActionHotbar.vue'
import GameplayOverlay from '../../pages/gameplay/ui/GameplayOverlay.vue'
import NearbyInteraction from '../../pages/gameplay/ui/NearbyInteraction.vue'
import { characterFixture, worldFixture } from '../testing/characterFixture'
import { graveFixture } from '../testing/graveFixture'

function fixture(cleric = false) {
    const player = characterFixture('self', {
        heroClass: cleric ? 'cleric' : 'vanguard',
        abilities: { known: ['pray', 'shot'], cooldowns: {}, casting: null, barrier: null },
    })
    const grave = graveFixture()
    const snapshot = { ...worldFixture([player]), graves: [grave] }
    const sendCommand = vi.fn<() => void>()
    const game = {
        sendCommand,
        setCombatTarget: vi.fn<() => void>(),
        isInteractionVisible: () => true,
        isPositionVisible: () => true,
    }
    const wrapper = mount(GameplayOverlay, {
        props: { player, snapshot, characters: [player], blocked: false, game: game as never },
        global: { stubs: { SpeechBubbles: true } },
    })
    return { player, grave, snapshot, wrapper, sendCommand }
}
const press = (code: string) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))

describe('typed grave projectiles', () => {
    it('routes Shot to an explicit grave without a character ID or forward aim preview', () => {
        const player = characterFixture('ranger', {
            heroClass: 'ranger',
            abilities: { known: ['shot'], cooldowns: {}, casting: null, barrier: null },
        })
        const grave = graveFixture()
        const wrapper = mount(ActionHotbar, {
            props: { player, grave, characters: [player], blocked: false },
        })
        try {
            wrapper.vm.activate(1)
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'use_ability', abilityId: 'shot', target: { kind: 'grave', id: grave.id } },
            ])
            expect(wrapper.emitted('shotPreviewChange')?.at(-1)).toEqual([undefined])
            wrapper.vm.activate(1)
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                {
                    type: 'auto_action',
                    action: {
                        kind: 'ability',
                        abilityId: 'shot',
                        target: { kind: 'grave', id: grave.id },
                    },
                },
            ])
        } finally {
            wrapper.unmount()
        }
    })
})

describe('temporary grave targeting', () => {
    it('approaches a temporary grave once, repeats on a rapid second press and stops on the third', async () => {
        const { wrapper, grave, sendCommand } = fixture()
        try {
            const key = `grave:${grave.id}`
            await wrapper.setProps({ nearbyTargetKey: key })
            expect(wrapper.vm.selectedKey).toBeUndefined()
            expect(wrapper.get('.hotbar').attributes('data-focused-target-key')).toBe(key)
            press('Digit1')
            press('Digit1')
            press('Digit1')
            const action = { kind: 'attack', target: { kind: 'grave', id: grave.id } }
            expect(sendCommand.mock.calls).toEqual([
                [{ type: 'auto_action', action: { ...action, once: true } }],
                [{ type: 'auto_action', action }],
                [{ type: 'auto_action', action: null }],
            ])
        } finally {
            wrapper.unmount()
        }
    })
    it.each(['target changes', 'grave is ruined', 'Escape'] as const)(
        'cancels a pending temporary grave action when %s',
        async (reason) => {
            const { wrapper, grave, snapshot, sendCommand } = fixture()
            try {
                await wrapper.setProps({ nearbyTargetKey: `grave:${grave.id}` })
                press('Digit1')
                press('Digit1')
                if (reason === 'target changes') {
                    await wrapper.setProps({ nearbyTargetKey: undefined })
                } else if (reason === 'grave is ruined') {
                    await wrapper.setProps({
                        snapshot: { ...snapshot, graves: [{ ...grave, phase: 'ruined' }] },
                    })
                } else {
                    press('Escape')
                }
                expect(sendCommand).toHaveBeenLastCalledWith({ type: 'cancel_control' })
                expect(wrapper.vm.selectedKey).toBeUndefined()
            } finally {
                wrapper.unmount()
            }
        }
    )
})

describe('grave selection and hotbar', () => {
    it('pins basic attacks and repeats to the grave, then clears on purification', async () => {
        const { wrapper, grave, snapshot, sendCommand } = fixture()
        try {
            wrapper.vm.selectGrave(grave.id)
            await flushPromises()
            expect(wrapper.get('.hotbar').attributes('data-selected-target-key')).toBe(
                `grave:${grave.id}`
            )
            press('Digit1')
            expect(sendCommand).toHaveBeenLastCalledWith({
                type: 'attack',
                target: { kind: 'grave', id: grave.id },
            })
            press('Digit1')
            expect(sendCommand).toHaveBeenLastCalledWith({
                type: 'auto_action',
                action: { kind: 'attack', target: { kind: 'grave', id: grave.id } },
            })
            await wrapper.setProps({
                snapshot: { ...snapshot, graves: [{ ...grave, phase: 'purified' }] },
            })
            expect(wrapper.vm.selectedGraveId).toBeUndefined()
            expect(wrapper.get('.hotbar').attributes('data-selected-target-key')).toBeUndefined()
        } finally {
            wrapper.unmount()
        }
    })
    it('ordinary prayer pins an available nearby grave and keeps explicit selection stable', async () => {
        const { wrapper, grave, sendCommand } = fixture(true)
        try {
            press('Digit2')
            expect(sendCommand).toHaveBeenLastCalledWith({
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } },
            })
            wrapper.vm.selectGrave(grave.id)
            await flushPromises()
            press('Digit2')
            expect(sendCommand).toHaveBeenLastCalledWith({
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } },
            })
        } finally {
            wrapper.unmount()
        }
    })
    it.each(['escape', 'button'] as const)(
        'cancels only the active ritual through the ordinary %s command',
        async (input) => {
            const { wrapper, grave, player, sendCommand } = fixture(true)
            try {
                await wrapper.setProps({
                    player: {
                        ...player,
                        abilities: {
                            ...player.abilities!,
                            casting: {
                                abilityId: 'pray',
                                mode: 'purify_grave',
                                targetId: grave.id,
                                target: { kind: 'grave', id: grave.id },
                                startedAt: 100_000,
                                completesAt: 110_000,
                            },
                        },
                    },
                })
                expect(wrapper.find('.control-status').exists()).toBe(false)
                if (input === 'escape') press('Escape')
                else await wrapper.get('button[aria-label="Прервать молитву"]').trigger('click')
                expect(sendCommand).toHaveBeenCalledWith({ type: 'cancel_prayer' })
            } finally {
                wrapper.unmount()
            }
        }
    )
    it('forgets a lost grave instead of redirecting the pinned action to a neighbor', async () => {
        const { wrapper, grave, snapshot } = fixture()
        try {
            wrapper.vm.selectGrave(grave.id)
            await flushPromises()
            await wrapper.setProps({
                snapshot: { ...snapshot, graves: [graveFixture({ id: 'neighbor' })] },
            })
            expect(wrapper.vm.selectedGraveId).toBeUndefined()
        } finally {
            wrapper.unmount()
        }
    })
})

describe('F grave inspection', () => {
    it('shows pinned facts without issuing a grave action and closes after purification', async () => {
        const player = characterFixture('self', {
            heroClass: 'cleric',
            abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
        })
        const grave = graveFixture()
        const snapshot = { ...worldFixture([player]), graves: [grave] }
        const wrapper = mount(NearbyInteraction, {
            props: { player, snapshot, characters: [player], blocked: false },
            attachTo: document.body,
        })
        try {
            wrapper.vm.openMenu()
            await flushPromises()
            const panel = wrapper.get('[role="dialog"]')
            expect(panel.attributes('aria-labelledby')).toBeTruthy()
            expect(wrapper.find('[role="menuitem"]').exists()).toBe(false)
            expect(wrapper.text()).toContain('Киркой быстрее')
            expect(document.activeElement).toBe(panel.get('button').element)
            expect(wrapper.emitted('targetChange')?.at(-1)?.[0]).toMatchObject({
                key: `grave:${grave.id}`,
            })
            await wrapper.setProps({
                snapshot: {
                    ...snapshot,
                    graves: [grave, graveFixture({ id: 'neighbor', position: { x: 0, y: 8 } })],
                },
            })
            expect(wrapper.emitted('targetChange')?.at(-1)?.[0]).toMatchObject({
                key: `grave:${grave.id}`,
            })
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'move_input', axis: { x: 0, y: 0 } }],
            ])
            await wrapper.setProps({
                snapshot: { ...snapshot, graves: [{ ...grave, phase: 'purified' }] },
            })
            expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })
})
