import type { GameEventPayload, Vector2 } from '@my-game-ratata/contracts'
import { type Actor, Color, Font, vec } from 'excalibur'

import type { EffectCue } from './combatEffectPlan'
import { isMeleeEffect } from './combatEffectPose'

interface AttachedEffect {
    actor: Actor
    started: number
    duration: number
    labelCharacterId?: string
    cue?: EffectCue
}

export function endedCombatEffect(event: GameEventPayload, cue: EffectCue | undefined): boolean {
    return Boolean(
        event.kind === 'cast'
            ? cue?.channel && cue.fromId === event.actorId
            : cue?.aimActionId === event.actionId
    )
}

export function takePrayerCompletion<
    T extends {
        prayerCompletion?: Pick<GameEventPayload, 'actorId' | 'abilityId'>
    },
>(effects: T[], event: GameEventPayload): T | undefined {
    for (let index = effects.length - 1; index >= 0; index -= 1) {
        const completion = effects[index]!.prayerCompletion
        if (
            completion &&
            completion.actorId === event.actorId &&
            completion.abilityId === event.abilityId
        )
            return effects.splice(index, 1)[0]
    }
    return undefined
}

export function combatCaptionFont(color: string): Font {
    return new Font({
        size: 8,
        bold: true,
        color: Color.fromHex(color),
        family: 'system-ui',
        shadow: { color: Color.Black, offset: vec(1, 1), blur: 0 },
    })
}

/** Attached cosmetics follow the body; trajectories and world-area effects keep server geometry. */
export function repositionCombatAttachments(
    barriers: ReadonlyMap<string, Actor>,
    effects: readonly AttachedEffect[],
    positionFor: (id: string) => Vector2 | undefined,
    now: number,
    reduced: boolean
): void {
    for (const [id, actor] of barriers) {
        const position = positionFor(id)
        if (!position) continue
        actor.pos = vec(position.x, position.y - 15)
        actor.z = position.y + 5
    }
    for (const effect of effects) {
        const cue = effect.cue
        const id = effect.labelCharacterId ?? attachedCueId(cue)
        const position = id ? positionFor(id) : undefined
        if (!position) continue
        const progress = reduced ? 0 : Math.min(1, (now - effect.started) / effect.duration)
        const offset = effect.labelCharacterId ? 42 : 15
        const rise = cue?.channel ? 0 : progress * 8
        effect.actor.pos = vec(position.x, position.y - offset - rise)
        effect.actor.z = position.y + (effect.labelCharacterId ? 30 : 10)
    }
}

function attachedCueId(cue: EffectCue | undefined): string | undefined {
    if (!cue || cue.target || cue.projectile || cue.travel || cue.wave || isMeleeEffect(cue.kind))
        return undefined
    return cue.channel ? cue.targetId : cue.fromId
}
