import type { AdventureRecipeId } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CharacterController } from './controllers'
import type { GameRoom } from './room'
import { canPerformSkillAction } from './skillProgression'
import { approach } from './workerNavigation'
export class ArtisanController implements CharacterController {
    private nextAt = 0
    private recipeId: AdventureRecipeId | undefined
    private crafted = false
    public update(actor: GameCharacter, room: GameRoom, now: number): void {
        const economy = room.adventureForWorkers().economy
        economy.reconcileWorkOrder(actor)
        if (this.recipeId !== undefined && !economy.hasWorkOrder(actor.id)) {
            this.recipeId = undefined
            this.crafted = false
        }
        if (!canPerformSkillAction(actor, now) || now < this.nextAt) {
            return
        }
        this.nextAt = now + 2000
        if (
            !approach(
                actor,
                room,
                actor.spawnLocationId,
                actor.spawnPosition,
                8
            )
        ) {
            return
        }
        if (this.recipeId === undefined) {
            this.recipeId = economy.startNextWork(actor, now)
            if (this.recipeId === undefined) {
                return
            }
            this.crafted = false
        }
        if (!this.crafted) {
            const result = room.requestAdventure(
                actor,
                { type: 'craft', recipeId: this.recipeId },
                now
            )
            room.publishEvents(result.events)
            this.crafted = result.accepted
        }
        if (this.crafted && economy.completeWorkOrder(actor, now)) {
            this.recipeId = undefined
            this.crafted = false
            this.nextAt = now + 30_000
        }
    }
}
