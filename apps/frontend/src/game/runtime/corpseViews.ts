import type { CharacterSnapshot, WorldChestSnapshot } from '@my-game-ratata/contracts'
import { Actor, type Engine, type SpriteSheet, vec } from 'excalibur'

import { characterCatalog, type CharacterId } from '../assets/characterCatalog'
import { characterFrame } from './characterFrame'

export function visibleCorpses(containers: WorldChestSnapshot[], characters: CharacterSnapshot[]) {
    return containers.filter(
        (container) =>
            container.kind === 'corpse' &&
            container.corpse &&
            !characters.some(
                (actor) =>
                    actor.id === container.corpse?.characterId &&
                    !actor.alive &&
                    actor.position.x === container.position.x &&
                    actor.position.y === container.position.y
            )
    )
}

export class CorpseViews {
    private readonly actors = new Map<string, Actor>()
    public constructor(
        private readonly engine: Engine,
        private readonly sheets: Map<CharacterId, SpriteSheet>
    ) {}

    public update(containers: WorldChestSnapshot[], characters: CharacterSnapshot[]): void {
        const corpses = visibleCorpses(containers, characters)
        const ids = new Set(corpses.map((corpse) => corpse.id))
        for (const [id, actor] of this.actors) {
            if (!ids.has(id)) {
                actor.kill()
                this.actors.delete(id)
            }
        }
        for (const corpse of corpses) {
            if (!corpse.corpse || this.actors.has(corpse.id)) continue
            const { visualId, facing } = corpse.corpse
            const sheet = this.sheets.get(visualId)
            const frame = characterFrame(
                characterCatalog[visualId],
                {
                    alive: false,
                    facing,
                    animation: { action: 'death', startedAt: 0 },
                },
                10_000
            )
            if (!sheet || !frame) continue
            const actor = new Actor({
                anchor: vec(0.5, 0.75),
                pos: vec(corpse.position.x, corpse.position.y),
                z: corpse.position.y - 1,
            })
            actor.graphics.use(sheet.getSprite(frame.frame, frame.row))
            actor.graphics.flipHorizontal = frame.flipHorizontal
            actor.graphics.opacity = 0.55
            this.engine.add(actor)
            this.actors.set(corpse.id, actor)
        }
    }

    public dispose(): void {
        for (const actor of this.actors.values()) actor.kill()
        this.actors.clear()
    }
}
