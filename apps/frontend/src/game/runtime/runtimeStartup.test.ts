import type { ClientMessage } from '@my-game-ratata/contracts'
import { PointerButton, type PointerEvent, PointerType } from 'excalibur'
import { beforeEach, expect, it, vi } from 'vitest'

import { RatataGame } from './ratataGame'
import type { RatataGameOptions } from './runtimeOptions'
import type { RenderedTiledMap } from './tiledMap'

const calls = vi.hoisted(() => ({
    load: vi.fn<() => Promise<RenderedTiledMap>>(),
    start: vi.fn<() => Promise<void>>(),
    stop: vi.fn<() => void>(),
    present: vi.fn<() => void>(),
    connect: vi.fn<() => void>(),
    music: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
    inputs: vi.fn<() => void>(),
    removeInputs: vi.fn<() => void>(),
    send: vi.fn<(command: ClientMessage) => void>(),
    handlers: undefined as
        | {
              keyDown: (event: KeyboardEvent) => void
              release: () => void
              pointer: (event: PointerEvent) => void
          }
        | undefined,
}))
vi.mock('./tiledMap', () => ({ loadRenderedTiledMap: calls.load }))
vi.mock('./runtimePresentation', () => ({
    createRuntimePresentation: (container: HTMLElement) => {
        calls.present()
        const canvas = document.createElement('canvas')
        canvas.dataset.gameCanvas = 'true'
        canvas.tabIndex = 0
        container.append(canvas)
        return {
            canvas,
            loader: {},
            engine: { start: calls.start, stop: calls.stop },
            audio: { playMusic: calls.music, stop: vi.fn<() => void>() },
            sceneActors: { dispose: calls.dispose },
        }
    },
}))
vi.mock('./runtimeInputLifecycle', () => ({
    installRuntimeInputs: (_engine: unknown, _canvas: unknown, handlers: typeof calls.handlers) => {
        calls.inputs()
        calls.handlers = handlers
        return calls.removeInputs
    },
}))
vi.mock('./plantingPreview', () => ({
    PlantingPreview: class {
        public initialize(): void {
            /* Cosmetic view is outside lifecycle rules. */
        }
        public dispose(): void {
            /* Cosmetic view is outside lifecycle rules. */
        }
    },
}))
vi.mock('./runtimeSocket', () => ({
    RuntimeSocket: class {
        public connect = calls.connect
        public send = calls.send
        public close(): void {
            /* No server is needed for an unjoined runtime. */
        }
    },
}))
beforeEach(() => {
    vi.clearAllMocks()
    calls.load.mockResolvedValue({ buildings: [] } as unknown as RenderedTiledMap)
    calls.start.mockResolvedValue()
})

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: Error) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}
function setup() {
    const container = document.createElement('div')
    const onError = vi.fn<(message: string) => void>()
    const onChatState = vi.fn<RatataGameOptions['onChatState']>()
    const game = new RatataGame({
        container,
        nickname: 'Cancelled startup',
        onError,
        onChatState,
        onInventoryToggle: vi.fn<RatataGameOptions['onInventoryToggle']>(),
        onSnapshot: vi.fn<RatataGameOptions['onSnapshot']>(),
        onStatus: vi.fn<RatataGameOptions['onStatus']>(),
    })
    return { game, container, onError, onChatState }
}
it('starts the current scene, controls, music and socket once', async () => {
    const { game, container } = setup()
    await game.start()
    expect(calls.present).toHaveBeenCalledOnce()
    expect(calls.inputs).toHaveBeenCalledOnce()
    expect(calls.music).toHaveBeenCalledOnce()
    expect(calls.connect).toHaveBeenCalledOnce()
    expect(container.children).toHaveLength(1)
    game.stop()
    expect(container.children).toHaveLength(0)
})
it('sends fresh movement when the same direction is pressed after a UI input release', async () => {
    const { game } = setup()
    await game.start()
    try {
        calls.handlers?.keyDown(new KeyboardEvent('keydown', { code: 'KeyD' }))
        game.releaseUiControls()
        calls.handlers?.keyDown(new KeyboardEvent('keydown', { code: 'KeyD' }))
        const movements = calls.send.mock.calls.filter(([command]) => command.type === 'move_input')
        expect(movements).toEqual([
            [{ type: 'move_input', axis: { x: 1, y: 0 } }],
            [{ type: 'move_input', axis: { x: 1, y: 0 } }],
        ])
        expect(calls.send).toHaveBeenCalledWith({ type: 'release_input' })
    } finally {
        game.stop()
    }
})
it.each([
    { button: PointerButton.Left, pointerType: PointerType.Mouse },
    { button: PointerButton.Unknown, pointerType: PointerType.Touch },
])(
    'uses the first world click only to suspend typing and restores the draft on the next Enter: $pointerType',
    async (pointer) => {
        const { game, container, onChatState } = setup()
        document.body.append(container)
        await game.start()
        try {
            const canvas = container.querySelector('canvas')!
            canvas.focus()
            calls.handlers?.keyDown(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }))
            calls.handlers?.keyDown(new KeyboardEvent('keydown', { key: 'я', code: 'KeyZ' }))
            calls.send.mockClear()
            calls.handlers?.pointer({
                ...pointer,
                worldPos: { x: 100, y: 150 },
            } as unknown as PointerEvent)
            expect(onChatState).toHaveBeenLastCalledWith({
                active: false,
                draft: 'я',
                maxLength: 400,
            })
            expect(
                calls.send.mock.calls
                    .flat()
                    .some((command) =>
                        ['chat', 'move_to', 'auto_action', 'attack'].includes(command.type)
                    )
            ).toBe(false)
            expect(document.activeElement).toBe(canvas)
            calls.handlers?.keyDown(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }))
            expect(onChatState).toHaveBeenLastCalledWith({
                active: true,
                draft: 'я',
                maxLength: 400,
            })
            game.cancelChat()
            expect(onChatState).toHaveBeenLastCalledWith({
                active: false,
                draft: '',
                maxLength: 400,
            })
            expect(document.activeElement).toBe(canvas)
        } finally {
            game.stop()
            container.remove()
        }
    }
)
it('keeps a private editor or modal in control when the world is clicked during public typing', async () => {
    const { game, container, onChatState } = setup()
    document.body.append(container)
    await game.start()
    const dialog = document.createElement('section')
    dialog.setAttribute('role', 'dialog')
    const input = document.createElement('input')
    dialog.append(input)
    try {
        container.querySelector('canvas')!.focus()
        calls.handlers?.keyDown(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }))
        document.body.append(dialog)
        input.focus()
        calls.send.mockClear()
        calls.handlers?.pointer({
            button: PointerButton.Left,
            worldPos: { x: 100, y: 150 },
        } as unknown as PointerEvent)
        expect(onChatState).toHaveBeenLastCalledWith({ active: true, draft: '', maxLength: 400 })
        expect(calls.send).not.toHaveBeenCalled()
        game.cancelChat()
        expect(document.activeElement).toBe(input)
    } finally {
        dialog.remove()
        game.stop()
        container.remove()
    }
})
it('never creates a scene, input listeners or connection after stopping during map loading', async () => {
    const map = deferred<RenderedTiledMap>()
    calls.load.mockReturnValue(map.promise)
    const { game, container } = setup()
    const startup = game.start()
    game.stop()
    map.resolve({ buildings: [] } as unknown as RenderedTiledMap)
    await startup
    expect(container.children).toHaveLength(0)
    expect(calls.present).not.toHaveBeenCalled()
    expect(calls.inputs).not.toHaveBeenCalled()
    expect(calls.connect).not.toHaveBeenCalled()
})
it('stops an engine that completes loading late without starting music or joining', async () => {
    const loaded = deferred<void>()
    calls.start.mockReturnValue(loaded.promise)
    const { game, container } = setup()
    const startup = game.start()
    await vi.waitFor(() => expect(calls.start).toHaveBeenCalledOnce())
    game.stop()
    expect(calls.removeInputs).toHaveBeenCalledOnce()
    loaded.resolve()
    await startup
    expect(calls.stop).toHaveBeenCalledTimes(2)
    expect(calls.dispose).toHaveBeenCalledTimes(2)
    expect(container.children).toHaveLength(0)
    expect(calls.music).not.toHaveBeenCalled()
    expect(calls.connect).not.toHaveBeenCalled()
})
it('ignores a rejected map promise after cancellation but still reports active startup failures', async () => {
    const map = deferred<RenderedTiledMap>()
    calls.load.mockReturnValue(map.promise)
    const { game } = setup()
    const startup = game.start()
    game.stop()
    map.reject(new Error('Late old map failure'))
    await expect(startup).resolves.toBeUndefined()
    calls.load.mockRejectedValue(new Error('Current map failed'))
    const fresh = setup()
    await expect(fresh.game.start()).rejects.toThrow('Current map failed')
})
it('suppresses an engine loading failure after it has already been stopped', async () => {
    const loaded = deferred<void>()
    calls.start.mockReturnValue(loaded.promise)
    const { game, container } = setup()
    const startup = game.start()
    await vi.waitFor(() => expect(calls.start).toHaveBeenCalledOnce())
    game.stop()
    loaded.reject(new Error('Late engine failure'))
    await expect(startup).resolves.toBeUndefined()
    expect(container.children).toHaveLength(0)
    expect(calls.music).not.toHaveBeenCalled()
    expect(calls.connect).not.toHaveBeenCalled()
})
