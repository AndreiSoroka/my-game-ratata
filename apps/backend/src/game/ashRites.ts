import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { AshExhaustionCasts } from './ashExhaustionCast'
import { AshOrders } from './ashOrders'
import { AshRaising } from './ashRaising'
import { AshSummons } from './ashSummons'
import { AshTaming } from './ashTaming'
import type { GameCharacter } from './character'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import type { WorldLocations } from './worldLocations'

type HeartRite = NonNullable<AbilityContext['useAshRite']>

export class AshRites {
    private readonly raising: AshRaising
    private readonly summons: AshSummons
    private readonly orders: AshOrders
    private readonly taming: AshTaming
    private readonly exhaustion = new AshExhaustionCasts()

    public constructor(
        private readonly world: () => WorldLocations,
        characters: Map<string, GameCharacter>,
        controllers: Map<string, CharacterController>,
        companions: CompanionService,
        private readonly useHeart: HeartRite
    ) {
        this.orders = new AshOrders(characters)
        this.summons = new AshSummons(
            world,
            characters,
            controllers,
            companions,
            (actor) => this.orders.clear(actor)
        )
        this.raising = new AshRaising(world, characters, this.summons)
        this.taming = new AshTaming(world, characters)
    }

    public readonly use: NonNullable<AbilityContext['useAshRite']> = (
        actor,
        message,
        context
    ) => {
        switch (message.abilityId) {
            case 'ash_raise':
                return this.raising.begin(actor, message.targetId, context)
            case 'ash_tame':
                return this.taming.begin(actor, message.targetId, context)
            case 'ash_exhaustion':
                return this.exhaustion.begin(actor, message.targetId, context)
            case 'ash_order':
                return this.orders.order(actor, message, context)
            case 'ash_gift':
            case 'ash_sacrifice':
                return this.orders.gift(
                    actor,
                    message.targetId,
                    message.abilityId === 'ash_sacrifice',
                    context
                )
            case 'ash_heart':
                return this.useHeart(actor, message, context)
        }
    }

    public advance(now: number): GameEventPayload[] {
        this.summons.advance(now)
        this.orders.advance()
        for (const location of this.world().locations.values()) {
            location.inventory.deathLoot.advanceRemains(now)
        }
        return [...this.raising.advance(now), ...this.taming.advance(now)]
    }

    public advanceExhaustionCasts(
        contextFor: (actor: GameCharacter) => AbilityContext
    ): GameEventPayload[] {
        return this.exhaustion.advance(contextFor)
    }
}
