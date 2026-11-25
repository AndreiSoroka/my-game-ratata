import type { MapSummary, WorldSnapshot } from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

import { resolveWorldMapUrl } from './runtimeSocket'
import { loadRenderedTiledMap, type RenderedTiledMap } from './tiledMap'

export interface RuntimeMapRequest {
    key: string
    locationId: string
    map: MapSummary
}

export function runtimeMapRequest(
    snapshot: WorldSnapshot,
    fallback?: MapSummary
): RuntimeMapRequest | undefined {
    const map = snapshot.location?.map ?? fallback
    if (!map?.asset?.url || !map.asset.revision) return undefined
    const locationId = snapshot.location?.id ?? map.id
    return {
        key: JSON.stringify([
            snapshot.serverEpoch ?? '',
            locationId,
            map.id,
            map.asset.revision,
            map.asset.url,
        ]),
        locationId,
        map,
    }
}

export function loadRuntimeMap(map: MapSummary): Promise<RenderedTiledMap> {
    const url = new URL(resolveWorldMapUrl(map.asset.url), window.location.origin)
    url.searchParams.set('revision', map.asset.revision)
    return loadRenderedTiledMap('/game/map', `${map.id}.json`, url.href)
}

interface MapLoadingHandlers {
    load?: (map: MapSummary) => Promise<RenderedTiledMap>
    apply: (map: RenderedTiledMap, request: RuntimeMapRequest) => Promise<void>
    loading: () => void
    ready: () => void
    failed: (message: string) => void
}

/** One map application at a time; an old epoch can neither render nor poison a later load. */
export class RuntimeMapLoading {
    private desired: RuntimeMapRequest | undefined
    private pending: string | undefined
    private applied: string | undefined
    private failure: string | undefined
    private loaded: { key: string; map: RenderedTiledMap } | undefined
    private generation = 0
    private applyQueue = Promise.resolve()
    public constructor(private readonly handlers: MapLoadingHandlers) {}

    public get isReady(): boolean {
        return this.desired !== undefined && this.applied === this.desired.key
    }
    public observe(request: RuntimeMapRequest | undefined): void {
        const changed = this.desired?.key !== request?.key
        this.desired = request
        if (!request) {
            if (this.failure === 'missing-descriptor') return
            this.generation += 1
            this.pending = this.applied = undefined
            this.failure = 'missing-descriptor'
            this.handlers.loading()
            this.handlers.failed(tGame('game.canvas.missingMap'))
            return
        }
        if (request?.key === this.applied) {
            if (changed) {
                this.generation += 1
                this.pending = undefined
                this.handlers.ready()
            }
            return
        }
        if (!request || [this.pending, this.applied, this.failure].includes(request.key)) return
        this.launch(request)
    }
    public retry(): void {
        this.failure = undefined
        this.observe(this.desired)
    }
    public stop(): void {
        this.invalidatePresentation()
        this.desired = this.loaded = undefined
    }
    public invalidatePresentation(): void {
        this.generation += 1
        this.pending = this.applied = this.failure = undefined
        this.applyQueue = Promise.resolve()
    }
    private launch(request: RuntimeMapRequest): void {
        const generation = ++this.generation
        const current = () => generation === this.generation && this.desired?.key === request.key
        this.pending = request.key
        this.failure = undefined
        this.handlers.loading()
        let loading: Promise<RenderedTiledMap>
        try {
            loading =
                this.loaded?.key === request.key
                    ? Promise.resolve(this.loaded.map)
                    : (this.handlers.load ?? loadRuntimeMap)(request.map)
        } catch (error) {
            loading = Promise.reject(error)
        }
        void loading
            .then(async (map) => {
                const apply = async () => {
                    if (!current()) return
                    this.loaded = { key: request.key, map }
                    this.applied = undefined
                    await this.handlers.apply(map, request)
                    if (current()) {
                        this.applied = request.key
                        this.pending = undefined
                        this.handlers.ready()
                    }
                }
                this.applyQueue = this.applyQueue.then(apply, apply)
                await this.applyQueue
            })
            .catch((error: unknown) => {
                if (!current()) return
                this.pending = undefined
                this.failure = request.key
                this.handlers.failed(
                    error instanceof Error ? error.message : tGame('game.canvas.failedMap')
                )
            })
    }
}
