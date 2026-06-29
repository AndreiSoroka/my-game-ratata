import { Flags } from 'excalibur'

let canvasFlagsEnabled = false

export function ensureExcaliburCanvasFlags(): void {
    if (canvasFlagsEnabled) {
        return
    }

    Flags.useCanvasGraphicsContext()
    canvasFlagsEnabled = true
}
