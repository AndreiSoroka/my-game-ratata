import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { Actor, Color, Engine, Font, Label, Rectangle, vec } from 'excalibur'

import { healthBarPercent } from '@/entities/player-vitals'

import { characterOverhead } from './characterPresentationGeometry'

export interface CharacterBundle {
    snapshot?: CharacterSnapshot
    body: Actor
    hpBack: Actor
    hpFill: Actor
    label: Label
}

const labelFont = new Font({
    color: Color.White,
    family: 'Pixelify Sans, system-ui, sans-serif',
    size: 8,
})
export function createBundle(): CharacterBundle {
    const label = new Label({ font: labelFont, text: '' })
    label.graphics.anchor = vec(0.5, 0.5)
    return {
        body: new Actor({ anchor: vec(0.5, 0.75), height: 48, width: 48 }),
        hpBack: createBar(Color.fromHex('#171717'), 32),
        hpFill: createBar(Color.Green, 32),
        label,
    }
}

function createBar(color: Color, width: number): Actor {
    const actor = new Actor({
        anchor: vec(0, 0.5),
        height: 3,
        width,
    })
    actor.graphics.use(new Rectangle({ color, height: 3, width }))

    return actor
}

export function removeBundle(engine: Engine, bundle: CharacterBundle): void {
    engine.remove(bundle.body)
    engine.remove(bundle.label)
    engine.remove(bundle.hpBack)
    engine.remove(bundle.hpFill)
}

export function updateBundleHealth(
    bundle: CharacterBundle,
    snapshot: CharacterSnapshot,
    isLocalPlayer: boolean
): void {
    const width = 32
    const ratio = healthBarPercent(snapshot.health) / 100
    const opacity = isLocalPlayer || snapshot.trainingTarget ? 0 : snapshot.alive ? 1 : 0.35

    bundle.hpFill.graphics.use(
        new Rectangle({
            color: ratio > 0.35 ? Color.Green : Color.Red,
            height: 3,
            width: Math.max(1, width * ratio),
        })
    )
    bundle.hpBack.graphics.opacity = opacity
    bundle.hpFill.graphics.opacity = opacity
}

export function positionBundle(bundle: CharacterBundle, snapshot: CharacterSnapshot): void {
    const overhead = characterOverhead(snapshot.visualId)
    bundle.body.pos = vec(snapshot.position.x, snapshot.position.y)
    bundle.body.z = snapshot.position.y
    bundle.label.pos = vec(snapshot.position.x, snapshot.position.y - overhead.label)
    bundle.label.z = bundle.body.z + 3
    for (const bar of [bundle.hpBack, bundle.hpFill]) {
        bar.pos = vec(snapshot.position.x - 16, snapshot.position.y - overhead.health)
        bar.z = bundle.body.z + 2
    }
}
