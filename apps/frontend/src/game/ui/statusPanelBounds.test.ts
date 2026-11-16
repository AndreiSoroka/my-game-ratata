import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import PlayerStatusPanel from './PlayerStatusPanel.vue'

it('keeps mobile target spacing relative to the game host through HUD resizing without moving focus', () => {
    let resize: ResizeObserverCallback | undefined
    const disconnect = vi.fn<() => void>()
    vi.stubGlobal(
        'ResizeObserver',
        class {
            public constructor(callback: ResizeObserverCallback) {
                resize = callback
            }
            public observe = vi.fn<(element: Element) => void>()
            public disconnect = disconnect
        }
    )
    const host = document.createElement('section')
    host.className = 'game-screen'
    const focused = document.createElement('button')
    host.append(focused)
    document.body.append(host)
    focused.focus()
    let bottom = 240
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
    ) {
        return this === host ? new DOMRect(0, 40, 390, 844) : new DOMRect(0, 80, 150, bottom - 80)
    })
    const view = mount(PlayerStatusPanel, {
        props: { character: characterFixture('cleric') },
        attachTo: host,
    })
    try {
        expect(host.style.getPropertyValue('--ratata-player-status-bottom')).toBe('208px')
        bottom = 280
        resize?.([], {} as ResizeObserver)
        expect(host.style.getPropertyValue('--ratata-player-status-bottom')).toBe('248px')
        expect(document.activeElement).toBe(focused)
        expect(view.emitted()).toEqual({})
        view.unmount()
        expect(host.style.getPropertyValue('--ratata-player-status-bottom')).toBe('')
        expect(disconnect).toHaveBeenCalledOnce()
    } finally {
        if (view.exists()) view.unmount()
        host.remove()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    }
})
