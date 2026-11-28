import type {
    CharacterSnapshot,
    GameEventPayload,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'

import { type BellImages, BellViews } from './bellViews'
import { DoorViews } from './doorViews'
import type { MapVisibility } from './mapVisibility'
import { SignReadingViews } from './signReadingViews'

/** Scene-owned visuals for objects that players can interact with. */
export class InteractionObjectViews {
    private readonly bells: BellViews
    private readonly doors: DoorViews
    private readonly signs: SignReadingViews

    public constructor(engine: Engine, images: BellImages) {
        this.bells = new BellViews(engine, images)
        this.doors = new DoorViews(engine)
        this.signs = new SignReadingViews(engine)
    }

    public setMap(map: MapVisibility, facadeDoorIds: ReadonlySet<string>): void {
        this.bells.clear()
        this.doors.setMap(facadeDoorIds)
        this.signs.setMap(map)
    }

    public update(
        snapshot: WorldSnapshot,
        player: CharacterSnapshot | undefined,
        visible: (point: Vector2) => boolean,
        approachVisible: (point: Vector2) => boolean
    ): void {
        const objects = snapshot.adventure?.worldObjects ?? []
        this.bells.updateSnapshot(snapshot, (bell) => visible(bell.position))
        this.doors.update(objects, approachVisible)
        this.signs.update(objects, player, visible)
    }

    public receive(event: GameEventPayload): void {
        this.bells.receive(event)
    }

    public dispose(): void {
        this.bells.clear()
        this.doors.clear()
        this.signs.dispose()
    }
}
