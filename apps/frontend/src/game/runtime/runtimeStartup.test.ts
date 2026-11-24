import type { ClientMessage, MapSummary, WorldSnapshot } from '@my-game-ratata/contracts'
import { type Engine, Future, PointerButton, type PointerEvent, PointerType } from 'excalibur'
import { beforeEach, expect, it, vi } from 'vitest'

import { EngineRun } from './engineRun'
import { RatataGame } from './ratataGame'
import type { RatataGameOptions } from './runtimeOptions'
import type { SnapshotReference } from './runtimeSnapshotStream'
import type { RenderedTiledMap } from './tiledMap'

const calls = vi.hoisted(() => ({
    load: vi.fn<() => Promise<RenderedTiledMap>>(),
    start: vi.fn<() => Promise<void>>(),
    stop: vi.fn<() => void>(),
    engineDispose: vi.fn<() => void>(),
    disableInput: vi.fn<() => void>(),
    clearBrowserListeners: vi.fn<() => void>(),
    loaderComplete: true,
    present: vi.fn<() => void>(),
    connect: vi.fn<() => void>(),
    socketHandlers: undefined as
        | {
              onWorldInit: (
                  id: string,
                  snapshot: WorldSnapshot,
                  map: MapSummary,
                  reference: SnapshotReference
              ) => void
              onSnapshot: (snapshot: WorldSnapshot, reference: SnapshotReference) => void
          }
        | undefined,
    music: vi.fn<() => void>(),
    sound: vi.fn<() => void>(),
    stopAudio: vi.fn<() => void>(),
    removePlanting: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
    inputs: vi.fn<() => void>(),
    removeInputs: vi.fn<() => void>(),
    send: vi.fn<(command: ClientMessage) => void>(),
    beginStop: vi.fn<(requestId: number) => void>(),
    cancelStop: vi.fn<() => void>(),
    frames: new Set<() => void>(),
    handlers: undefined as
        | {
              keyDown: (event: KeyboardEvent) => void
              keyUp: (event: KeyboardEvent) => void
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
        let isReady = false
        const engine = {
            start: async () => {
                await calls.start()
                isReady = true
            },
            stop: calls.stop,
            dispose: calls.engineDispose,
            setInputEnabled: calls.disableInput,
            browser: { clear: calls.clearBrowserListeners },
            get isReady() {
                return isReady
            },
            ready: Promise.resolve(),
            on: (_event: string, callback: () => void) => calls.frames.add(callback),
            off: (_event: string, callback: () => void) => calls.frames.delete(callback),
            screen: {
                getWorldBounds: () => ({ left: 10, top: 20, right: 200, bottom: 100 }),
            },
        } as unknown as Engine
        const run = new EngineRun(canvas, () => engine)
        run.addCleanup(calls.dispose)
        run.addCleanup(calls.stopAudio)
        return {
            run,
            canvas,
            loader: {
                get isLoaded() {
                    return calls.loaderComplete
                },
            },
            engine,
            audio: {
                playMusic: calls.music,
                playSound: calls.sound,
                suspendWorld: vi.fn<() => void>(),
                setMap: vi.fn<(...args: unknown[]) => void>(),
                observeWorld: vi.fn<(...args: unknown[]) => void>(),
            },
            sceneActors: {
                dispose: calls.dispose,
                update: vi.fn<(...args: unknown[]) => void>(),
                addMap: vi.fn<(...args: unknown[]) => void>(),
                setInteractionTarget: vi.fn<(...args: unknown[]) => void>(),
                setCombatTarget: vi.fn<(...args: unknown[]) => void>(),
                clearDamage: vi.fn<(...args: unknown[]) => void>(),
                beginStop: (requestId: number) => {
                    calls.beginStop(requestId)
                    return { id: requestId, streamId: 1, seq: 0, position: { x: 83, y: 80 } }
                },
                cancelStop: calls.cancelStop,
            },
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
        public initialize(): () => void {
            return calls.removePlanting
        }
        public dispose(): void {
            /* Cosmetic view is outside lifecycle rules. */
        }
    },
}))
vi.mock('./runtimeSocket', () => ({
    resolveWorldMapUrl: (url: string) => url,
    RuntimeSocket: class {
        public constructor(handlers: typeof calls.socketHandlers) {
            calls.socketHandlers = handlers
        }
        public connect = calls.connect
        public send = calls.send
        public close(): void {
            /* No server is needed for an unjoined runtime. */
        }
    },
}))
beforeEach(() => {
    vi.clearAllMocks()
    calls.frames.clear()
    calls.loaderComplete = true
    calls.load.mockResolvedValue({ buildings: [], tileWidth: 16 } as unknown as RenderedTiledMap)
    calls.start.mockResolvedValue()
})

function setup() {
    const container = document.createElement('div')
    const onError = vi.fn<(message: string) => void>()
    const onChatState = vi.fn<RatataGameOptions['onChatState']>()
    const onMapError = vi.fn<(message: string | null) => void>()
    const game = new RatataGame({
        container,
        nickname: 'Cancelled startup',
        onError,
        onMapError,
        onChatState,
        onInventoryToggle: vi.fn<RatataGameOptions['onInventoryToggle']>(),
        onSnapshot: vi.fn<RatataGameOptions['onSnapshot']>(),
        onStatus: vi.fn<RatataGameOptions['onStatus']>(),
    })
    return { game, container, onError, onMapError, onChatState }
}
it('starts the current scene, controls, music and socket once', async () => {
    const { game, container } = setup()
    await startWorld(game)
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
    await startWorld(game)
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
it('sends one visible stop request after the final held direction and cancels it on new movement', async () => {
    const { game } = setup()
    await startWorld(game)
    try {
        const handlers = calls.handlers!
        handlers.keyDown(new KeyboardEvent('keydown', { code: 'KeyD' }))
        handlers.keyDown(new KeyboardEvent('keydown', { code: 'KeyD', repeat: true }))
        handlers.keyDown(new KeyboardEvent('keydown', { code: 'KeyW' }))
        handlers.keyUp(new KeyboardEvent('keyup', { code: 'KeyW' }))
        expect(calls.beginStop).not.toHaveBeenCalled()
        expect(
            calls.send.mock.calls.filter(([command]) => command.type === 'cancel_control')
        ).toHaveLength(2)
        handlers.keyUp(new KeyboardEvent('keyup', { code: 'KeyD' }))
        handlers.keyUp(new KeyboardEvent('keyup', { code: 'KeyD' }))
        const requestId = calls.beginStop.mock.lastCall?.[0]
        expect(calls.beginStop).toHaveBeenCalledExactlyOnceWith(requestId)
        expect(Number.isSafeInteger(requestId)).toBe(true)
        expect(calls.send).toHaveBeenLastCalledWith({
            type: 'move_input',
            axis: { x: 0, y: 0 },
            stopCorrection: { id: requestId, streamId: 1, seq: 0, position: { x: 83, y: 80 } },
        })
        calls.cancelStop.mockClear()
        handlers.keyDown(new KeyboardEvent('keydown', { code: 'KeyA' }))
        expect(calls.cancelStop).toHaveBeenCalledOnce()
    } finally {
        game.stop()
    }
})
it('reports the ready camera view again after a server epoch change and stops observing on disposal', async () => {
    const { game } = setup()
    await startWorld(game)
    calls.frames.forEach((callback) => callback())
    expect(calls.send).toHaveBeenCalledWith({
        type: 'set_viewport',
        locationId: 'map-2-2',
        bounds: { left: 0, top: 0, right: 224, bottom: 128 },
    })
    calls.send.mockClear()
    calls.load.mockResolvedValueOnce({
        buildings: [],
        tileWidth: 24,
    } as unknown as RenderedTiledMap)
    initialize('new-world')
    await vi.waitFor(() => expect(game.selectionTileSize).toBe(24))
    calls.frames.forEach((callback) => callback())
    expect(
        calls.send.mock.calls.filter(([command]) => command.type === 'set_viewport')
    ).toHaveLength(1)
    game.stop()
    expect(calls.frames.size).toBe(0)
})
it.each([
    { button: PointerButton.Left, pointerType: PointerType.Mouse },
    { button: PointerButton.Unknown, pointerType: PointerType.Touch },
])(
    'uses the first world click only to suspend typing and restores the draft on the next Enter: $pointerType',
    async (pointer) => {
        const { game, container, onChatState } = setup()
        document.body.append(container)
        await startWorld(game)
        const editor = document.createElement('input')
        editor.dataset.publicChatInput = ''
        container.appendChild(editor)
        try {
            const canvas = container.querySelector('canvas')!
            canvas.focus()
            calls.handlers?.keyDown(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }))
            editor.focus()
            game.updateChatDraft('я')
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
    await startWorld(game)
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
it('connects before requesting a map and ignores any map after stopping', async () => {
    const map = new Future<RenderedTiledMap>()
    calls.load.mockReturnValue(map.promise)
    const { game, container } = setup()
    await game.start()
    expect(calls.connect).toHaveBeenCalledOnce()
    expect(calls.load).not.toHaveBeenCalled()
    initialize()
    expect(calls.load).toHaveBeenCalledWith(
        '/game/map',
        'map-2-2.json',
        expect.stringContaining('/world/maps/a/map-2-2.json?revision=a')
    )
    game.stop()
    map.resolve({ buildings: [] } as unknown as RenderedTiledMap)
    await Promise.resolve()
    expect(container.children).toHaveLength(0)
    expect(calls.present).not.toHaveBeenCalled()
})
it('detaches a cancelled presentation immediately and disposes the engine once loading settles', async () => {
    const loaded = new Future<void>()
    calls.start.mockReturnValue(loaded.promise)
    const { game, container } = setup()
    await game.start()
    initialize()
    await vi.waitFor(() => expect(calls.start).toHaveBeenCalledOnce())
    game.stop()
    game.stop()
    expect(container.children).toHaveLength(0)
    expect(calls.removeInputs).toHaveBeenCalledOnce()
    expect(calls.removePlanting).toHaveBeenCalledOnce()
    expect(calls.stopAudio).toHaveBeenCalledOnce()
    expect(calls.dispose).toHaveBeenCalledOnce()
    expect(calls.disableInput).toHaveBeenCalledExactlyOnceWith(false)
    expect(calls.frames.size).toBe(0)
    expect(calls.stop).not.toHaveBeenCalled()
    expect(calls.engineDispose).not.toHaveBeenCalled()
    loaded.resolve()
    await vi.waitFor(() => expect(calls.engineDispose).toHaveBeenCalledOnce())
    expect(calls.stop).toHaveBeenCalledOnce()
    expect(calls.clearBrowserListeners).toHaveBeenCalledOnce()
    expect(calls.music).not.toHaveBeenCalled()
})

it('plays UI feedback only once the current engine is ready', async () => {
    const loaded = new Future<void>()
    calls.start.mockReturnValueOnce(loaded.promise)
    const { game } = setup()
    await game.start()
    initialize()
    await vi.waitFor(() => expect(calls.start).toHaveBeenCalledOnce())
    game.playUiSound('uiClick')
    expect(calls.sound).not.toHaveBeenCalled()
    loaded.resolve()
    await vi.waitFor(() => expect(calls.music).toHaveBeenCalledOnce())
    game.playUiSound('uiClick')
    expect(calls.sound).toHaveBeenCalledExactlyOnceWith('uiClick')
    game.stop()
})

it('leaves a later presentation intact when an old engine finishes loading', async () => {
    const loaded = new Future<void>()
    calls.start.mockReturnValueOnce(loaded.promise)
    const { game, container, onMapError } = setup()
    await game.start()
    initialize('old')
    await vi.waitFor(() => expect(calls.start).toHaveBeenCalledOnce())
    game.stop()
    const landing = document.createElement('div')
    container.append(landing)
    await startWorld(game)
    const currentCanvas = container.querySelector('canvas')
    expect(currentCanvas).not.toBeNull()
    loaded.resolve()
    await vi.waitFor(() => expect(calls.engineDispose).toHaveBeenCalledOnce())
    expect(container.querySelector('canvas')).toBe(currentCanvas)
    expect(container.contains(landing)).toBe(true)
    expect(onMapError).not.toHaveBeenCalledWith(expect.any(String))
    expect(calls.music).toHaveBeenCalledOnce()
    expect(calls.removeInputs).toHaveBeenCalledOnce()
    expect(calls.frames.size).toBe(1)
    game.stop()
})

it('reports and retries a loader that resolves without all resources', async () => {
    calls.loaderComplete = false
    const { game, container, onMapError } = setup()
    await game.start()
    initialize()
    await vi.waitFor(() =>
        expect(onMapError).toHaveBeenCalledWith('Excalibur did not finish loading its resources')
    )
    expect(calls.engineDispose).toHaveBeenCalledOnce()
    expect(container.children).toHaveLength(0)
    expect(calls.music).not.toHaveBeenCalled()
    calls.loaderComplete = true
    game.retryMap()
    await vi.waitFor(() => expect(calls.music).toHaveBeenCalledOnce())
    game.stop()
})
it('keeps current map failures retryable while suppressing cancelled failures', async () => {
    const map = new Future<RenderedTiledMap>()
    calls.load.mockReturnValue(map.promise)
    const old = setup()
    await old.game.start()
    initialize()
    old.game.stop()
    map.reject(new Error('Late old map failure'))
    await Promise.resolve()
    expect(old.onMapError).not.toHaveBeenCalledWith('Late old map failure')
    calls.load.mockRejectedValueOnce(new Error('Current map failed'))
    const fresh = setup()
    await fresh.game.start()
    initialize()
    await vi.waitFor(() => expect(fresh.onMapError).toHaveBeenCalledWith('Current map failed'))
    expect(fresh.onError).not.toHaveBeenCalled()
    calls.load.mockResolvedValue({ buildings: [], tileWidth: 16 } as unknown as RenderedTiledMap)
    fresh.game.retryMap()
    await vi.waitFor(() => expect(calls.music).toHaveBeenCalledOnce())
    fresh.game.stop()
})
it('suppresses an engine loading failure after it has already been stopped', async () => {
    const loaded = new Future<void>()
    calls.start.mockReturnValue(loaded.promise)
    const { game, container, onMapError } = setup()
    await game.start()
    initialize()
    await vi.waitFor(() => expect(calls.start).toHaveBeenCalledOnce())
    game.stop()
    loaded.reject(new Error('Late engine failure'))
    await vi.waitFor(() => expect(calls.engineDispose).toHaveBeenCalledOnce())
    expect(container.children).toHaveLength(0)
    expect(calls.music).not.toHaveBeenCalled()
    expect(onMapError).not.toHaveBeenCalledWith('Late engine failure')
})
it('reloads the same location after a new server epoch and ignores an obsolete initial map', async () => {
    const old = new Future<RenderedTiledMap>()
    const current = { buildings: [], tileWidth: 24 } as unknown as RenderedTiledMap
    calls.load.mockReturnValueOnce(old.promise).mockResolvedValueOnce(current)
    const { game } = setup()
    await game.start()
    initialize('old')
    initialize('new')
    await vi.waitFor(() => expect(calls.music).toHaveBeenCalledOnce())
    old.resolve({ buildings: [], tileWidth: 8 } as unknown as RenderedTiledMap)
    await Promise.resolve()
    expect(calls.present).toHaveBeenCalledOnce()
    expect(game.selectionTileSize).toBe(24)
    game.stop()
})

function initialize(epoch = 'a'): void {
    const map: MapSummary = {
        id: 'map-2-2',
        asset: { url: `/world/maps/${epoch}/map-2-2.json`, revision: epoch },
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        worldWidth: 1536,
        worldHeight: 1280,
        solidLayerNames: ['Collision'],
    }
    const snapshot = {
        serverEpoch: epoch,
        characters: [],
        location: { id: map.id, map },
    } as unknown as WorldSnapshot
    calls.socketHandlers?.onWorldInit('hero', snapshot, map, { streamId: 1, seq: 0 })
}
async function startWorld(game: RatataGame): Promise<void> {
    await game.start()
    initialize()
    await vi.waitFor(() => expect(calls.music).toHaveBeenCalledOnce())
}
