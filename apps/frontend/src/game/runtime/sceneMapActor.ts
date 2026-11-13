import { Actor, Canvas, vec } from 'excalibur'

import type { RenderedTiledMap } from './tiledMap'

export function createSceneMapActor(map: RenderedTiledMap): Actor {
    const actor = new Actor({
        anchor: vec(0, 0),
        height: map.worldHeight,
        pos: vec(0, 0),
        width: map.worldWidth,
        z: -100,
    })
    actor.graphics.use(
        new Canvas({
            cache: true,
            draw: (context) => context.drawImage(map.bitmap, 0, 0),
            height: map.worldHeight,
            smoothing: false,
            width: map.worldWidth,
        })
    )
    return actor
}
