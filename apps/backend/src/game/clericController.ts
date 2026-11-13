import type { CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { supportPrayerDecision } from './clericPolicy'
import type { CharacterController } from './controllers'
import type { GameRoom } from './room'

export class ClericController implements CharacterController {
    public update(character: GameCharacter, room: GameRoom, now: number): void {
        const world: CompanionWorld = room
        if (
            world.charactersFor === undefined ||
            world.requestAbility === undefined
        ) {
            return
        }
        if (
            character.controllerKind === 'network_player' ||
            character.soul.controlSource === 'human'
        ) {
            return
        }
        const request = world.requestAbility.bind(world)
        const events = supportPrayerDecision(
            character,
            {
                characters: world.charactersFor(character),
                navigation: world.navigationFor(character),
                now,
            },
            request
        )
        room.publishEvents(events)
    }
}
