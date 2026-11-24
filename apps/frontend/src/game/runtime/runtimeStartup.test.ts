import { Future, PointerButton, type PointerEvent, PointerType } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { calls, initialize, setup, startWorld } from './runtimeStartupFixture'
import type { RenderedTiledMap } from './tiledMap'

it('starts the current scene, controls, audio and socket once', async () => {
    const { game, container } = setup()
    await startWorld(game)
    expect(calls.present).toHaveBeenCalledExactlyOnceWith('map-2-2')
    expect(calls.inputs).toHaveBeenCalledOnce()
    expect(calls.music).toHaveBeenCalledOnce()
    expect(calls.ambience).toHaveBeenCalledOnce()
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
    expect(calls.ambience).not.toHaveBeenCalled()
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
