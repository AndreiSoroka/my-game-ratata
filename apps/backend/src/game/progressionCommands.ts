import type {
    GameEventPayload,
    ProgressionClientMessage,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import {
    chooseDeity,
    learnFireball,
    studyMagic,
    teachMagic,
} from './magicLearning'
import type { NavigationService } from './navigation'
import { pray } from './prayer'
import { canPerceivePrayerCaster } from './prayerAuras'
import { canPerformSkillAction } from './skillProgression'
import { castSpell } from './spellCasting'

export interface ProgressionContext extends AbilityContext {
    characters: readonly GameCharacter[]
    navigation: NavigationService
    now: number
    random?: () => number
}

export function handleProgressionCommand(
    actor: GameCharacter,
    message: ProgressionClientMessage,
    context: ProgressionContext
): GameEventPayload[] {
    if (!canPerformSkillAction(actor, context.now)) {
        return []
    }
    if (message.type !== 'pray' && message.type !== 'cast_spell') {
        const target = context.characters.find(
            (candidate) => candidate.id === message.targetId
        )
        if (!validInteractionTarget(actor, target, context)) {
            return []
        }
    }
    switch (message.type) {
        case 'pray':
            return pray(
                actor,
                context.now,
                context.random,
                context,
                undefined,
                message.abilityId
            )
        case 'learn_skill':
            return learnFireball(
                actor,
                context.characters.find(
                    (target) => target.id === message.targetId
                ),
                context.now
            )
        case 'choose_deity':
            return chooseDeity(
                actor,
                context.characters.find(
                    (target) => target.id === message.targetId
                ),
                message.deityId,
                context.now
            )
        case 'study_magic':
            return studyMagic(
                actor,
                context.characters.find(
                    (target) => target.id === message.targetId
                ),
                context.now
            )
        case 'teach_magic':
            return teachMagic(
                actor,
                context.characters.find(
                    (target) => target.id === message.targetId
                ),
                context.now
            )
        case 'cast_spell':
            return castSpell(actor, message, context)
    }
}

function validInteractionTarget(
    actor: GameCharacter,
    target: GameCharacter | undefined,
    context: ProgressionContext
): boolean {
    return (
        target !== undefined &&
        canPerceivePrayerCaster(actor, target, context.now) &&
        context.navigation.hasLineOfSight(actor.position, target.position)
    )
}
