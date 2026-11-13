import {
    type GameEventPayload,
    REVIVE_CAST_MS,
    REVIVE_MANA_COST,
    REVIVE_RANGE,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { restoreCharacter } from './characterRecovery'
import { resolveMiracle } from './deities'
import { createCharacterConfig } from './heroClasses'
import { distance } from './math'
import {
    canUseResurrection,
    createProgression,
    trainSkill,
} from './skillProgression'

interface RevivalCast {
    completesAt: number
    targetId: string
}

const revivalCasts = new WeakMap<GameCharacter, RevivalCast>()

export function shouldRetireCharacter(
    character: GameCharacter,
    now: number
): boolean {
    return (
        character.mortal &&
        !character.alive &&
        character.reviveUntil > 0 &&
        now >= character.reviveUntil
    )
}

export function retireCharacter(character: GameCharacter): GameEventPayload {
    character.inventory = []
    character.equipment = {}
    character.xp = 0
    character.level = 1
    character.progression = createProgression()
    Object.assign(
        character.config,
        createCharacterConfig(character.archetype, character.heroClass)
    )
    character.maxHp = character.config.combat.maxHp
    character.tags.add('state.retired')
    character.clearPath()
    character.clearPendingAttackHit()
    revivalCasts.delete(character)
    return { actorId: character.id, kind: 'permadeath' }
}

export function beginRevive(
    caster: GameCharacter,
    target: GameCharacter,
    now: number
): boolean {
    if (
        revivalCasts.has(caster) ||
        caster.isActionLocked(now) ||
        !canRevive(caster, target, now)
    ) {
        return false
    }
    revivalCasts.set(caster, {
        completesAt: now + REVIVE_CAST_MS,
        targetId: target.id,
    })
    caster.lockAction(now, REVIVE_CAST_MS)
    caster.setAnimation('attack', now, REVIVE_CAST_MS)
    return true
}

export function advanceRevive(
    caster: GameCharacter,
    findTarget: (id: string) => GameCharacter | undefined,
    now: number,
    random?: () => number
): GameEventPayload[] {
    const cast = revivalCasts.get(caster)
    if (cast === undefined) {
        return []
    }
    const target = findTarget(cast.targetId)
    if (target === undefined || !canRevive(caster, target, now)) {
        revivalCasts.delete(caster)
        caster.actionLockUntil = now
        caster.animationUntil = now
        return []
    }
    if (now < cast.completesAt) {
        return []
    }
    revivalCasts.delete(caster)
    caster.mana -= REVIVE_MANA_COST
    const outcome = resolveMiracle(caster, now, random)
    const faithEvents = trainSkill(caster, 'faith')
    if (!outcome.success) {
        return [
            {
                actorId: caster.id,
                targetId: target.id,
                kind: 'notice',
                text: 'Угольная Мать не вернула душу. Мана потрачена; можно повторить молитву, пока не истекло время.',
            },
            ...faithEvents,
        ]
    }
    restoreCharacter(target, now, false)
    return [
        { actorId: caster.id, targetId: target.id, kind: 'revive' },
        ...faithEvents,
        ...trainSkill(caster, 'miracles'),
    ]
}

function canRevive(
    caster: GameCharacter,
    target: GameCharacter,
    now: number
): boolean {
    return (
        canUseResurrection(caster) &&
        caster.alive &&
        caster.stunUntil <= now &&
        caster.mana >= REVIVE_MANA_COST &&
        !target.alive &&
        !target.tags.has('state.retired') &&
        target.reviveUntil > now &&
        target.faction === caster.faction &&
        target.locationId === caster.locationId &&
        distance(caster.position, target.position) <= REVIVE_RANGE
    )
}
