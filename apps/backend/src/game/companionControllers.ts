import type { GameCharacter } from './character'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import type { GameRoom } from './room'

export class CompanionController implements CharacterController {
    public constructor(private readonly service: CompanionService) {}

    public update(character: GameCharacter, room: GameRoom, now: number): void {
        room.publishEvents(this.service.update(character, room, now))
    }
}

export class PolicyController implements CharacterController {
    public constructor(
        private readonly service: CompanionService,
        private readonly fallback: CharacterController
    ) {}

    public update(character: GameCharacter, room: GameRoom, now: number): void {
        if (!this.service.hasActiveLease(character, now)) {
            this.fallback.update(character, room, now)
        }
    }
}
