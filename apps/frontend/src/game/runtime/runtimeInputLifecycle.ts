import type { Engine, PointerEvent } from 'excalibur'

import { preventContextMenu } from './input'
import { isEditableTarget } from './runtimeQueries'

interface InputHandlers {
    keyDown: (event: KeyboardEvent) => void
    keyUp: (event: KeyboardEvent) => void
    release: () => void
    pointer: (event: PointerEvent) => void
}
export function installRuntimeInputs(
    engine: Engine,
    canvas: HTMLCanvasElement,
    handlers: InputHandlers
): () => void {
    const hidden = () => {
        if (document.hidden) handlers.release()
    }
    const focus = (event: FocusEvent) => {
        if (isEditableTarget(event.target)) handlers.release()
    }
    window.addEventListener('keydown', handlers.keyDown)
    window.addEventListener('keyup', handlers.keyUp)
    window.addEventListener('blur', handlers.release)
    window.addEventListener('focusin', focus)
    document.addEventListener('visibilitychange', hidden)
    canvas.addEventListener('contextmenu', preventContextMenu)
    engine.input.pointers.primary.on('down', handlers.pointer)
    return () => {
        window.removeEventListener('keydown', handlers.keyDown)
        window.removeEventListener('keyup', handlers.keyUp)
        window.removeEventListener('blur', handlers.release)
        window.removeEventListener('focusin', focus)
        document.removeEventListener('visibilitychange', hidden)
        canvas.removeEventListener('contextmenu', preventContextMenu)
        engine.input.pointers.primary.off('down', handlers.pointer)
    }
}
