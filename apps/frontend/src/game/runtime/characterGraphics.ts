import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { type Actor, Color, type Sprite, type SpriteSheet } from 'excalibur'

import { characterCatalog, type CharacterId } from '../assets/characterCatalog'
import { characterFrame } from './characterFrame'
import { trainingDummyGraphic } from './trainingDummyGraphic'

export class CharacterGraphics {
    private readonly dummy = trainingDummyGraphic()
    private readonly lichSprites = new WeakMap<Sprite, Sprite>()
    public constructor(private readonly sheets: Map<CharacterId, SpriteSheet>) {}
    public update(
        actor: Actor,
        snapshot: CharacterSnapshot,
        now: number,
        hurtElapsed?: number
    ): void {
        actor.graphics.opacity =
            !snapshot.alive || snapshot.movement?.mode === 'sneaking' ? 0.55 : 1
        if (snapshot.visualId === 'training_dummy') {
            actor.graphics.use(this.dummy)
            actor.graphics.flipHorizontal = false
            return
        }
        const sheet = this.sheets.get(snapshot.visualId)
        const graphic = characterFrame(
            characterCatalog[snapshot.visualId],
            snapshot,
            now,
            hurtElapsed
        )
        if (!sheet || !graphic) return
        const sprite = sheet.getSprite(graphic.frame, graphic.row)
        actor.graphics.use(snapshot.tags.includes('state.lich') ? this.lichSprite(sprite) : sprite)
        actor.graphics.flipHorizontal = graphic.flipHorizontal
    }

    private lichSprite(sprite: Sprite): Sprite {
        const cached = this.lichSprites.get(sprite)
        if (cached !== undefined) return cached
        const tinted = sprite.clone()
        tinted.tint = Color.fromHex('#a0caff')
        this.lichSprites.set(sprite, tinted)
        return tinted
    }
}
