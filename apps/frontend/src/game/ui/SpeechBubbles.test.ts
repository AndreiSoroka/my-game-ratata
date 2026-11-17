import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import SpeechBubbles from './SpeechBubbles.vue'

describe('single full conversation bubble', () => {
    it('keeps full dialogue visible beyond ambient expiry and clears transient speech', async () => {
        vi.useFakeTimers()
        const player = characterFixture('self'),
            npc = characterFixture('guard'),
            text = 'Длинная речь стражницы. '.repeat(20)
        const snapshot = {
            ...worldFixture([player, npc]),
            adventure: {
                ...adventureFixture(),
                dialogue: {
                    npcId: npc.id,
                    npcName: 'Рада',
                    title: 'Разговор',
                    text,
                    choices: [],
                    canTrade: false,
                },
            },
        }
        const game = { projectCharacter: () => ({ x: 5, y: 5, width: 390, height: 700 }) }
        const wrapper = mount(SpeechBubbles, { props: { game: game as never, snapshot, player } })
        try {
            expect(wrapper.get('.speech-text').text()).toBe(text.trim())
            expect(wrapper.get('.speech-bubble').attributes('style')).toContain('left: 12px')
            vi.advanceTimersByTime(10000)
            await wrapper.vm.$nextTick()
            expect(wrapper.findAll('.speech-text')).toHaveLength(1)
            wrapper.vm.receive({ kind: 'chat', actorId: npc.id, targetId: player.id, text })
            await wrapper.vm.$nextTick()
            expect(wrapper.findAll('.speech-text')).toHaveLength(1)
            await wrapper.setProps({
                snapshot: { ...snapshot, adventure: { ...snapshot.adventure, dialogue: null } },
            })
            wrapper.vm.receive({ kind: 'chat', actorId: npc.id, text: 'Привет' })
            await wrapper.vm.$nextTick()
            expect(wrapper.get('.speech-text').text()).toBe('Привет')
            vi.advanceTimersByTime(9000)
            await wrapper.vm.$nextTick()
            expect(wrapper.find('.speech-text').exists()).toBe(false)
        } finally {
            wrapper.unmount()
            vi.useRealTimers()
        }
    })
    it('announces a repeated reply only on its new receipt, and never resurrects expired ambient receipts', async () => {
        vi.useFakeTimers()
        const player = characterFixture('self'),
            npc = characterFixture('guard')
        const speech = {
            npcId: npc.id,
            npcName: 'Рада',
            title: 'Разговор',
            text: 'Та же реплика',
            choices: [],
            canTrade: false,
            speechId: 1,
        }
        const snapshot = {
            ...worldFixture([player, npc]),
            adventure: { ...adventureFixture(), dialogue: speech },
        }
        const wrapper = mount(SpeechBubbles, {
            props: {
                player,
                snapshot,
                game: {
                    projectCharacter: () => ({ x: 100, y: 200, width: 390, height: 700 }),
                } as never,
            },
        })
        try {
            const first = wrapper.get('.speech-bubble').element
            await wrapper.setProps({ snapshot: { ...snapshot, tick: 2 } })
            expect(wrapper.get('.speech-bubble').element).toBe(first)
            await wrapper.setProps({
                snapshot: {
                    ...snapshot,
                    adventure: { ...snapshot.adventure, dialogue: { ...speech, speechId: 2 } },
                },
            })
            expect(wrapper.get('.speech-bubble').element).not.toBe(first)
            expect(wrapper.get('.speech-bubble').attributes('id')).toBe('speech-guard-2')
            await wrapper.setProps({
                snapshot: { ...snapshot, adventure: { ...snapshot.adventure, dialogue: null } },
            })
            const event = { kind: 'chat' as const, actorId: npc.id, text: 'Привет', speechId: 3 }
            wrapper.vm.receive(event)
            await wrapper.vm.$nextTick()
            expect(wrapper.find('.speech-bubble').exists()).toBe(true)
            vi.advanceTimersByTime(9000)
            await wrapper.vm.$nextTick()
            wrapper.vm.receive(event)
            await wrapper.vm.$nextTick()
            expect(wrapper.find('.speech-bubble').exists()).toBe(false)
            wrapper.vm.receive({ ...event, speechId: 4 })
            await wrapper.vm.$nextTick()
            expect(wrapper.get('.speech-bubble').attributes('id')).toBe('speech-guard-4')
        } finally {
            wrapper.unmount()
            vi.useRealTimers()
        }
    })
})

it('anchors measured short and long replies above the speaker, clamps the viewport and releases hidden speakers', async () => {
    const player = characterFixture('self')
    const npc = characterFixture('guard')
    const snapshot = {
        ...worldFixture([player, npc]),
        adventure: {
            ...adventureFixture(),
            dialogue: {
                npcId: npc.id,
                npcName: 'Рада',
                title: 'Разговор',
                text: 'Коротко.',
                choices: [],
                canTrade: false,
                speechId: 1,
            },
        },
    }
    let height = 64
    const bounds = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(() => new DOMRect(0, 0, 360, height))
    let resized: ResizeObserverCallback | undefined
    const observe = vi.fn<ResizeObserver['observe']>()
    const unobserve = vi.fn<ResizeObserver['unobserve']>()
    const disconnect = vi.fn<ResizeObserver['disconnect']>()
    vi.stubGlobal(
        'ResizeObserver',
        class {
            public constructor(callback: ResizeObserverCallback) {
                resized = callback
            }
            public observe = observe
            public unobserve = unobserve
            public disconnect = disconnect
        }
    )
    const projectCharacter = vi.fn<
        () => { x: number; y: number; width: number; height: number } | undefined
    >(() => ({ x: 200, y: 400, width: 600, height: 700 }))
    const wrapper = mount(SpeechBubbles, {
        props: { player, snapshot, game: { projectCharacter } as never },
    })
    try {
        await wrapper.vm.$nextTick()
        const bubble = wrapper.get('.speech-bubble').element as HTMLElement
        expect(bubble.style.top).toBe('324px')
        expect(bubble.style.left).toBe('20px')
        expect(bubble.style.width).toBe('360px')
        expect(bubble.style.getPropertyValue('--speech-tail')).toBe('180px')
        expect(observe).toHaveBeenCalledWith(bubble)
        height = 240
        resized?.(
            [
                {
                    target: bubble,
                    borderBoxSize: [],
                    contentBoxSize: [],
                    devicePixelContentBoxSize: [],
                    contentRect: new DOMRect(0, 0, 360, height),
                },
            ],
            { observe, unobserve, disconnect }
        )
        await wrapper.vm.$nextTick()
        expect(bubble.style.top).toBe('148px')
        projectCharacter.mockReturnValue({ x: 5, y: 30, width: 320, height: 500 })
        await wrapper.setProps({ snapshot: { ...snapshot, tick: 2 } })
        expect(bubble.style.top).toBe('12px')
        expect(bubble.style.left).toBe('12px')
        expect(bubble.style.width).toBe('296px')
        projectCharacter.mockReturnValue(undefined)
        await wrapper.setProps({ snapshot: { ...snapshot, tick: 3 } })
        expect(wrapper.find('.speech-bubble').exists()).toBe(false)
        expect(unobserve).toHaveBeenCalledWith(bubble)
    } finally {
        wrapper.unmount()
        expect(disconnect).toHaveBeenCalledOnce()
        bounds.mockRestore()
        vi.unstubAllGlobals()
    }
})
