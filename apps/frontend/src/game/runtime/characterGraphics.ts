import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import type { Actor, SpriteSheet } from 'excalibur'

import { characterCatalog, type CharacterId } from '../assets/characterCatalog'
import { characterFrame } from './characterFrame'
import { trainingDummyGraphic } from './trainingDummyGraphic'

export class CharacterGraphics {
    private readonly dummy = trainingDummyGraphic()
    public constructor(private readonly sheets: Map<CharacterId, SpriteSheet>) {}
    public update(
        actor: Actor,
        snapshot: CharacterSnapshot,
        now: number,
        hurtElapsed?: number
    ): void {
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
        actor.graphics.use(sheet.getSprite(graphic.frame, graphic.row))
        actor.graphics.flipHorizontal = graphic.flipHorizontal
        actor.graphics.opacity = snapshot.alive ? 1 : 0.55
    }
}
