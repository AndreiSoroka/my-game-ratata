import { Actor, Canvas, type Engine, vec } from 'excalibur'

import type { MapDepthProp } from './mapDepthProps'

export class DepthPropViews {
    private actors: Actor[] = []
    public constructor(private readonly engine: Engine) {}

    public setProps(props: MapDepthProp[]): void {
        for (const actor of this.actors) actor.kill()
        this.actors = props.map((prop) => {
            const actor = new Actor({
                anchor: vec(0, 0),
                pos: vec(prop.x, prop.y),
                width: prop.width,
                height: prop.height,
                z: prop.baseY,
            })
            actor.graphics.use(
                new Canvas({
                    width: prop.width,
                    height: prop.height,
                    cache: true,
                    smoothing: false,
                    draw: (context) => context.drawImage(prop.bitmap, 0, 0),
                })
            )
            this.engine.add(actor)
            return actor
        })
    }
}
