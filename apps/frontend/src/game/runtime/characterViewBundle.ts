import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { Actor, Color, Engine, Font, Label, Rectangle, vec } from 'excalibur'

export interface CharacterBundle {
    snapshot?: CharacterSnapshot
    body: Actor
    hpBack: Actor
    hpFill: Actor
    label: Label
    message: Label
    messageUntil: number
}

const labelFont = new Font({
    color: Color.White,
    family: 'Pixelify Sans, system-ui, sans-serif',
    size: 8,
})
const messageFont = new Font({
    color: Color.White,
    family: 'Pixelify Sans, system-ui, sans-serif',
    size: 7,
})
export function createBundle(): CharacterBundle {
    const message = new Label({ font: messageFont, maxWidth: 110, text: '' })
    // Label resets GraphicsComponent.anchor in its constructor in Excalibur 0.32.
    message.graphics.anchor = vec(0.5, 1)
    const label = new Label({ font: labelFont, text: '' })
    label.graphics.anchor = vec(0.5, 0.5)
    return {
        body: new Actor({ anchor: vec(0.5, 0.75), height: 48, width: 48 }),
        hpBack: createBar(Color.fromHex('#171717'), 32),
        hpFill: createBar(Color.Green, 32),
        label,
        message,
        messageUntil: 0,
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
    engine.remove(bundle.message)
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
    const ratio = Math.max(0, Math.min(1, snapshot.hp / snapshot.maxHp))
    const opacity = isLocalPlayer ? 0 : snapshot.alive ? 1 : 0.35

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
