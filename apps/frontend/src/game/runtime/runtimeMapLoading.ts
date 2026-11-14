import { loadRenderedTiledMap, type RenderedTiledMap } from './tiledMap'

/** Apply only the location that still belongs to the active runtime after the async load. */
export async function loadRuntimeMap(
    mapId: string,
    current: () => boolean,
    apply: (map: RenderedTiledMap) => void,
    failed: (message: string) => void
): Promise<void> {
    try {
        const map = await loadRenderedTiledMap('/game/map', `${mapId}.json`)
        if (current()) apply(map)
    } catch (error) {
        if (current()) failed(error instanceof Error ? error.message : 'Map loading failed')
    }
}
