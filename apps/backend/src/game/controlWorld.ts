import type {
    GameEventPayload,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'

export interface ControlWorld {
    adventureForWorkers?(): AdventureService
    abilityContextFor?(actor: GameCharacter, now: number): AbilityContext
    publishEvents?(events: GameEventPayload[]): void
    getCharacter(id: string): GameCharacter | undefined
    navigationFor(actor: GameCharacter): NavigationService
    requestAttack(
        actor: GameCharacter,
        now?: number,
        targetId?: string,
        target?: WorldCombatTarget
    ): void
}
