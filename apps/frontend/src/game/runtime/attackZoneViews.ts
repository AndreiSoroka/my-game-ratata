import type { AttackZone } from '@my-game-ratata/contracts'
import { Actor, Color, type Engine, Rectangle, vec } from 'excalibur'

export class AttackZoneViews {
    private actors: Actor[] = []
    public constructor(private readonly engine: Engine) {}

    public update(zones: AttackZone[]): void {
        for (const actor of this.actors) this.engine.remove(actor)
        this.actors = zones.map((zone) => {
            const width = zone.maxX - zone.minX,
                height = zone.maxY - zone.minY
            const actor = new Actor({
                anchor: vec(0.5, 0.5),
                width,
                height,
                z: 500,
                pos: vec(zone.minX + width / 2, zone.minY + height / 2),
            })
            actor.graphics.use(new Rectangle({ color: Color.fromHex('#ffcf5a'), width, height }))
            actor.graphics.opacity = 0.35
            this.engine.add(actor)
            return actor
        })
    }
}
