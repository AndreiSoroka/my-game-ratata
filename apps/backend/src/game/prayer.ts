import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { deityDefinitions, resolveMiracle } from './deities'
import { canPerformSkillAction, trainSkill } from './skillProgression'

export function pray(
    actor: GameCharacter,
    now: number,
    random?: () => number
): GameEventPayload[] {
    if (!canPerformSkillAction(actor, now)) {
        return []
    }
    const missing = missingPrayerResource(actor)
    if (
        missing < 1 ||
        actor.mana < 5 ||
        now < actor.progression.prayerAvailableAt
    ) {
        return []
    }
    actor.mana -= 5
    actor.progression.prayerAvailableAt = now + 3_000
    actor.lockAction(now, 400)
    actor.setAnimation('attack', now, 400)
    const outcome = resolveMiracle(actor, now, random)
    const events = trainSkill(actor, 'faith')
    if (!outcome.success) {
        return [
            {
                actorId: actor.id,
                kind: 'notice',
                text: `${deityDefinitions[actor.progression.patron].name} не отвечает. Молитва укрепила вашу веру.`,
            },
            ...events,
        ]
    }
    const restored = restorePrayerResource(actor, outcome.quality)
    return [
        {
            actorId: actor.id,
            kind: 'notice',
            amount: restored,
            text: miracleDescription(actor, restored),
        },
        ...events,
        ...trainSkill(actor, 'miracles'),
    ]
}

function missingPrayerResource(actor: GameCharacter): number {
    switch (actor.progression.patron) {
        case 'hearth':
            return actor.maxHp - actor.hp
        case 'road':
            return actor.config.resources.maxEnergy - actor.energy
        case 'lantern':
            return actor.config.resources.maxMana - actor.mana
    }
}

function restorePrayerResource(actor: GameCharacter, quality: number): number {
    const level = actor.progression.skills.miracles.level - 1
    switch (actor.progression.patron) {
        case 'hearth': {
            const restored = Math.min(
                actor.maxHp - actor.hp,
                Math.round((6 + level * 2) * quality)
            )
            actor.hp += restored
            return restored
        }
        case 'road': {
            const restored = Math.min(
                actor.config.resources.maxEnergy - actor.energy,
                Math.round((15 + level * 3) * quality)
            )
            actor.energy += restored
            return restored
        }
        case 'lantern': {
            const restored = Math.min(
                actor.config.resources.maxMana - actor.mana,
                Math.round((12 + level * 2) * quality)
            )
            actor.mana += restored
            return restored
        }
    }
}

function miracleDescription(actor: GameCharacter, amount: number): string {
    const resources = {
        hearth: 'здоровья',
        road: 'выносливости',
        lantern: 'маны',
    }
    return `${deityDefinitions[actor.progression.patron].name}: восстановлено ${String(Math.round(amount))} ${resources[actor.progression.patron]}.`
}
