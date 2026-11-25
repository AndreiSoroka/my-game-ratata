import type { Engine } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { returnFromSpeech } from '../../pages/gameplay/model/dialogueSpeechKeys'
import { combatInputBlocked } from '../ui/combatTargeting'
import { installRuntimeInputs } from './runtimeInputLifecycle'
import { isEditableTarget } from './runtimeQueries'

describe('ambient speech keyboard ownership', () => {
    it('releases held controls on focus, blocks capture-phase shortcuts and returns to the canvas with Escape', () => {
        const canvas = document.createElement('canvas')
        canvas.dataset.gameCanvas = 'true'
        canvas.tabIndex = 0
        const speech = document.createElement('div')
        speech.className = 'speech-text'
        speech.tabIndex = 0
        document.body.append(canvas, speech)
        const release = vi.fn<() => void>()
        const engine = {
            input: { pointers: { primary: { on: vi.fn<() => void>(), off: vi.fn<() => void>() } } },
        } as unknown as Engine
        const remove = installRuntimeInputs(engine, canvas, {
            release,
            keyDown: vi.fn<() => void>(),
            keyUp: vi.fn<() => void>(),
            pointer: vi.fn<() => void>(),
        })
        try {
            speech.focus()
            expect(release).toHaveBeenCalledOnce()
            expect(isEditableTarget(speech)).toBe(true)
            expect(combatInputBlocked()).toBe(true)
            returnFromSpeech(new KeyboardEvent('keydown', { code: 'Escape' }), 'ambient-only')
            expect(document.activeElement).toBe(canvas)
            expect(combatInputBlocked()).toBe(false)
        } finally {
            remove()
            speech.remove()
            canvas.remove()
        }
    })
})
