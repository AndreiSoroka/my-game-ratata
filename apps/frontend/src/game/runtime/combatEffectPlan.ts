import {
    ABILITY_DEFINITIONS,
    type CharacterSnapshot,
    type DeityId,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import { BARRIER_COLOR, type EffectShape, FIRE_COLOR, SPARK_COLOR } from './effectGraphics'
import { deityColors } from './prayerGraphics'

export interface EffectCue {
    kind: EffectShape
    fromId: string
    targetId: string
    deity: DeityId
    color: string
    duration: number
    travel?: boolean
    wave?: boolean
    channel?: boolean
    count?: number
}
function attackShape(event: GameEventPayload, actor: CharacterSnapshot): EffectShape {
    const abilities: Record<string, EffectShape> = {
        shot: 'arrow',
        spark: 'spark',
        fireball: 'fireball',
        greater_fireball: 'fireball',
        skeleton_strike: 'bone',
    }
    if (event.abilityId && abilities[event.abilityId]) return abilities[event.abilityId]!
    if (actor.basicAttackKind === 'arrow') return 'arrow'
    if (actor.basicAttackKind === 'spark') return 'spark'
    return 'slash'
}
export function combatEffectCues(event: GameEventPayload, actor: CharacterSnapshot): EffectCue[] {
    const deity = actor.progression?.deity.id ?? 'hearth'
    const targetId = event.targetId ?? actor.id
    const base = { fromId: targetId, targetId, deity, color: deityColors[deity], duration: 650 }
    if (event.kind === 'attack') return [attackCue(event, actor, base)]
    if (event.kind === 'cast' && event.abilityId === 'pray')
        return prayerCastCues(event, actor, base)
    if (event.kind === 'heal' && (event.amount ?? 0) > 0)
        return [{ ...base, kind: 'restore', count: 10 }]
    if (event.kind === 'revive') return [{ ...base, kind: 'revive', duration: 1000, count: 12 }]
    return impactCues(event, actor, base)
}
function prayerCastCues(
    event: GameEventPayload,
    actor: CharacterSnapshot,
    base: Omit<EffectCue, 'kind'>
): EffectCue[] {
    if (event.phase === 'completed')
        return [
            {
                ...base,
                kind: 'devotion',
                fromId: actor.id,
                targetId: actor.id,
                duration: 600,
                count: 4,
            },
        ]
    if (event.phase === 'started')
        return [
            {
                ...base,
                fromId: actor.id,
                kind: 'casting',
                duration: 3000,
                channel: true,
                count: 12,
            },
        ]
    return []
}
function impactCues(
    event: GameEventPayload,
    actor: CharacterSnapshot,
    base: Omit<EffectCue, 'kind'>
): EffectCue[] {
    if (event.kind === 'notice' && event.abilityId === 'pray')
        return [
            {
                ...base,
                kind: 'refused',
                fromId: actor.id,
                targetId: actor.id,
                duration: 450,
                count: 0,
            },
        ]
    if (event.kind === 'absorb' && (event.amount ?? 0) > 0) {
        const cues: EffectCue[] = [
            { ...base, kind: 'barrier', color: BARRIER_COLOR, duration: 250, count: 4 },
        ]
        return [...cues, ...prayerHit(event, actor, base)]
    }
    if (event.kind === 'damage' && (event.amount ?? 0) > 0) return prayerHit(event, actor, base)
    return []
}
function prayerHit(
    event: GameEventPayload,
    actor: CharacterSnapshot,
    base: Omit<EffectCue, 'kind'>
): EffectCue[] {
    if (event.abilityId !== 'pray') return []
    return [
        {
            ...base,
            kind: 'wave',
            fromId: actor.id,
            targetId: actor.id,
            wave: true,
            duration: 550,
            count: 12,
        },
        { ...base, kind: 'prayer_hit', duration: 550, count: 8 },
    ]
}
export function eventCaption(event: GameEventPayload): string | undefined {
    const captions: Partial<Record<GameEventPayload['kind'], () => string | undefined>> = {
        heal: () => healingCaption(event),
        absorb: () => positiveAmount(event, 'Барьер −'),
        miss: () => 'Промах',
        revive: () => 'Возрождение',
        status: () => (event.statusId === 'stun' ? 'СТАН' : undefined),
        cast: () => castCaption(event),
        damage: () => (event.critical ? 'КРИТ!' : undefined),
        attack: () => (event.abilityId === 'skeleton_strike' ? 'Костяной удар…' : undefined),
    }
    return captions[event.kind]?.()
}
function positiveAmount(event: GameEventPayload, prefix: string): string | undefined {
    return event.amount && event.amount > 0 ? `${prefix}${event.amount}` : undefined
}

function attackCue(
    event: GameEventPayload,
    actor: CharacterSnapshot,
    base: Omit<EffectCue, 'kind'>
): EffectCue {
    const kind = attackShape(event, actor)
    const travel = ['arrow', 'spark', 'fireball'].includes(kind)
    const colors: Partial<Record<EffectShape, string>> = {
        arrow: '#dfe5e8',
        spark: SPARK_COLOR,
        fireball: FIRE_COLOR,
    }
    return {
        ...base,
        kind,
        fromId: actor.id,
        travel,
        color: colors[kind] ?? base.color,
        duration: attackDuration(event, kind),
        count: kind === 'arrow' ? 0 : 6,
    }
}

function attackDuration(event: GameEventPayload, kind: EffectShape): number {
    if (event.abilityId) return ABILITY_DEFINITIONS[event.abilityId].windupMs
    if (kind === 'arrow') return ABILITY_DEFINITIONS.shot.windupMs
    if (kind === 'spark') return ABILITY_DEFINITIONS.spark.windupMs
    return 220
}

function healingCaption(event: GameEventPayload): string | undefined {
    const resources: Record<string, string> = { hp: 'HP', mana: 'Мана', energy: 'Энергия' }
    return positiveAmount(event, `${resources[event.text ?? 'hp'] ?? 'HP'} +`)
}
function castCaption(event: GameEventPayload): string | undefined {
    if (event.phase === 'interrupted') return 'Прервано'
    if (event.phase === 'completed' && event.abilityId === 'pray') return 'Молитва'
    if (event.phase === 'started' && event.abilityId === 'skeleton_strike') return 'Костяной удар…'
    return undefined
}
