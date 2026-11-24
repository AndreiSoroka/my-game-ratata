import type { CharacterSnapshot, Vector2 } from '@my-game-ratata/contracts'
import { Actor, Canvas, type Engine, vec } from 'excalibur'

import { MapBackdrop } from './mapBackdrop'
import { mapCameraStrategy } from './mapCamera'
import { SceneDungeonLighting } from './sceneDungeonLighting'
import { SceneWaterAnimation } from './sceneWaterAnimation'
import type { RenderedTiledMap } from './tiledMap'

export class SceneMapView {
    private readonly backdrop: MapBackdrop
    private readonly water: SceneWaterAnimation
    private readonly lighting: SceneDungeonLighting
    private actor: Actor | undefined
    private cameraStrategy: ReturnType<typeof mapCameraStrategy> | undefined
    private followedActor: Actor | undefined

    public constructor(
        private readonly engine: Engine,
        positionOf: (id: string) => Vector2 | undefined = () => undefined,
        portalPositions?: () => Vector2[]
    ) {
        this.backdrop = new MapBackdrop(engine)
        this.water = new SceneWaterAnimation(engine)
        this.lighting = new SceneDungeonLighting(engine, positionOf, portalPositions)
    }

    public setMap(map: RenderedTiledMap): void {
        this.actor?.kill()
        if (map.dungeonLights === undefined) this.backdrop.setMap(map)
        else this.backdrop.dispose()
        this.cameraStrategy = mapCameraStrategy(map)
        this.followedActor = undefined
        this.actor = createSceneMapActor(map)
        this.engine.add(this.actor)
        this.water.setMap(this.actor, map.animatedWater)
        this.lighting.setMap(map.dungeonLights, map.visibility)
    }

    public updateLighting(characters: CharacterSnapshot[], playerId: string | undefined): void {
        this.lighting.sync(characters, playerId)
    }

    public follow(actor: Actor): void {
        if (actor === this.followedActor) return
        const camera = this.engine.currentScene.camera
        camera.clearAllStrategies()
        camera.zoom = 3
        camera.strategy.lockToActor(actor)
        if (this.cameraStrategy) camera.addStrategy(this.cameraStrategy)
        this.followedActor = actor
    }

    public dispose(): void {
        this.water.dispose()
        this.lighting.dispose()
        this.actor?.kill()
        this.actor = undefined
        this.backdrop.dispose()
        this.engine.currentScene.camera.clearAllStrategies()
        this.followedActor = this.cameraStrategy = undefined
    }
}

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
