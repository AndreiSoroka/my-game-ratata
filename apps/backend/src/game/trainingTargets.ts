import type { TrainingTargetDefinition } from '@my-game-ratata/contracts'

import { GameCharacter } from './character'
import type { CharacterController } from './controllers'
import { zeroVector } from './math'
import type { NavigationService } from './navigation'
import type { SpawnedCharacter } from './spawns'

export class StationaryController implements CharacterController {
    public update(character: GameCharacter): void {
        character.clearPath()
        character.setMoveInput(zeroVector())
    }
}

export function createTrainingTargets(
    navigation: NavigationService
): SpawnedCharacter[] {
    return (navigation.grid.training?.targets ?? []).map((definition) => ({
        character: createTrainingTarget(definition),
        controller: new StationaryController(),
    }))
}

export function createTrainingTarget(
    definition: TrainingTargetDefinition
): GameCharacter {
    const character = new GameCharacter({
        id: definition.id,
        nickname: 'Тренировочный манекен',
        archetype: 'human',
        creatureType: 'construct',
        controllerKind: 'scripted',
        faction: 'peaceful',
        mortal: false,
        respawnPolicy: 'none',
        locationId: definition.locationId,
        spawnPosition: definition.position,
        visualId: definition.visualId,
        trainingTarget: { areaId: definition.areaId },
        soul: {
            canSpeak: false,
            personality: 'Неподвижная тренировочная цель.',
        },
    })
    character.config.moveSpeed = 0
    character.config.combat.dodgeChance = 0
    return character
}
