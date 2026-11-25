import type {
    ClientMessage,
    GameEventPayload,
    MapSummary,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { type Engine, type PointerEvent } from 'excalibur'
import { beforeEach, expect, vi } from 'vitest'

import { EngineRun } from './engineRun'
import { RatataGame } from './ratataGame'
import type { RatataGameOptions } from './runtimeOptions'
import type { RuntimeSocket } from './runtimeSocket'
import type { RenderedTiledMap } from './tiledMap'

const calls = vi.hoisted(() => ({
    load: vi.fn<() => Promise<RenderedTiledMap>>(),
    start: vi.fn<() => Promise<void>>(),
    stop: vi.fn<() => void>(),
    engineDispose: vi.fn<() => void>(),
    disableInput: vi.fn<() => void>(),
    clearBrowserListeners: vi.fn<() => void>(),
    loaderComplete: true,
    present: vi.fn<(locationId: string) => void>(),
    connect: vi.fn<() => void>(),
    socketHandlers: undefined as ConstructorParameters<typeof RuntimeSocket>[0] | undefined,
    music: vi.fn<() => void>(),
    ambience: vi.fn<() => void>(),
    audioMap: vi.fn<(map: RenderedTiledMap, locationId: string) => void>(),
    audioResumed: vi.fn<() => void>(),
    audioInvalidated: vi.fn<() => void>(),
    audioWorld: vi.fn<(...args: unknown[]) => void>(),
    audioEvent: vi.fn<(event: GameEventPayload, serverTime?: number) => void>(),
    positionVisible: () => true,
    characterVisible: (id: string) => id === 'hero',
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
export { calls }

vi.mock('./tiledMap', () => ({ loadRenderedTiledMap: calls.load }))
vi.mock('./runtimePresentation', () => ({
    createRuntimePresentation: (
        container: HTMLElement,
        _map: RenderedTiledMap,
        locationId: string,
        onContextLost: () => void
    ) => {
        calls.present(locationId)
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
        canvas.addEventListener('webglcontextlost', onContextLost)
        run.addCleanup(() => canvas.removeEventListener('webglcontextlost', onContextLost))
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
                startWorldAmbience: calls.ambience,
                playMusic: calls.music,
                playSound: calls.sound,
                playEventSound: calls.audioEvent,
                suspendWorld: vi.fn<() => void>(),
                resumeWorld: calls.audioResumed,
                invalidateWorld: calls.audioInvalidated,
                setMap: calls.audioMap,
                observeWorld: calls.audioWorld,
            },
            sceneActors: {
                dispose: calls.dispose,
                update: vi.fn<(...args: unknown[]) => void>(),
                addMap: vi.fn<(...args: unknown[]) => void>(),
                setInteractionTarget: vi.fn<(...args: unknown[]) => void>(),
                setCombatTarget: vi.fn<(...args: unknown[]) => void>(),
                clearDamage: vi.fn<(...args: unknown[]) => void>(),
                isPositionVisible: calls.positionVisible,
                isCharacterVisible: calls.characterVisible,
                showDamage: vi.fn<(event: GameEventPayload) => void>(),
                holdMotion: vi.fn<() => void>(),
                setMotionTiming: vi.fn<() => void>(),
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
        public estimateMotionReceiptTime = () => undefined
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

export function setup() {
    const container = document.createElement('div')
    const onError = vi.fn<(message: string) => void>()
    const onChatState = vi.fn<RatataGameOptions['onChatState']>()
    const onMapError = vi.fn<(message: string | null) => void>()
    const onGraphicsRecovery = vi.fn<NonNullable<RatataGameOptions['onGraphicsRecovery']>>()
    const game = new RatataGame({
        container,
        nickname: 'Cancelled startup',
        onError,
        onMapError,
        onGraphicsRecovery,
        onChatState,
        onInventoryToggle: vi.fn<RatataGameOptions['onInventoryToggle']>(),
        onSnapshot: vi.fn<RatataGameOptions['onSnapshot']>(),
        onStatus: vi.fn<RatataGameOptions['onStatus']>(),
    })
    return { game, container, onError, onMapError, onChatState, onGraphicsRecovery }
}
export function initialize(epoch = 'a', locationId = 'map-2-2'): void {
    const map: MapSummary = {
        id: locationId,
        asset: { url: `/world/maps/${epoch}/${locationId}.json`, revision: epoch },
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
    calls.socketHandlers?.onWorldInit('hero', snapshot, map, { streamId: 1, seq: 0 }, 50)
}
export async function startWorld(game: RatataGame): Promise<void> {
    await game.start()
    initialize()
    await vi.waitFor(() => expect(calls.music).toHaveBeenCalledOnce())
}
