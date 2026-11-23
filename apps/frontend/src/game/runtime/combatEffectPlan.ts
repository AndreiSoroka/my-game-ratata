import { prayerSchoolId } from '@my-game-ratata/contracts'
import {
    ABILITY_DEFINITIONS,
    type CharacterSnapshot,
    type DeityId,
    type GameEventPayload,
    GRAVE_PURIFY_CAST_MS,
    isArrowAbility,
    isFireSpell,
    isPrayerAction,
    PRAYER_SCHOOL_DEFINITIONS,
    type ProjectilePath,
    snapshotPrayerParameters,
    type WorldCombatTarget,
} from '@my-game-ratata/contracts'

import { abilityName, gameLocale, tGame, tLocalized } from '@/shared/lib/i18n'

import { combatHitLabel } from './combatHitLabel'
import { BARRIER_COLOR, type EffectShape, FIRE_COLOR, SPARK_COLOR } from './effectGraphics'
import { deityColors } from './prayerGraphics'
import { isFloatingNotice } from './runtimeQueries'

export interface EffectCue {
    kind: EffectShape
    projectile?: ProjectilePath
    target?: WorldCombatTarget
    fromId: string
    targetId: string
    deity: DeityId
    color: string
    duration: number
    travel?: boolean
    wave?: boolean
    radius?: number
    channel?: boolean
    aimActionId?: string
    count?: number
}

export function channelEnded(
    cue: EffectCue | undefined,
    character: (id: string) => CharacterSnapshot | undefined
): boolean {
    return Boolean(cue?.channel && !character(cue.fromId)?.abilities?.casting)
}
function attackShape(event: GameEventPayload, actor: CharacterSnapshot): EffectShape {
    if (isArrowAbility(event.abilityId)) return 'arrow'
    const abilities: Record<string, EffectShape> = {
        spark: 'spark',
        skeleton_strike: 'bone',
    }
    if (event.abilityId && abilities[event.abilityId]) return abilities[event.abilityId]!
    if (actor.basicAttackKind === 'arrow') return 'arrow'
    if (actor.basicAttackKind === 'spark') return 'spark'
    return 'slash'
}
export function combatEffectCues(event: GameEventPayload, actor: CharacterSnapshot): EffectCue[] {
    const deity = eventDeity(event, actor)
    const targetId = event.targetId ?? actor.id
    const base = {
        fromId: targetId,
        targetId,
        deity,
        color: deityColors[deity],
        duration: 650,
        ...(event.target ? { target: event.target } : {}),
    }
    if (event.kind === 'attack')
        return isFireSpell(event.abilityId ?? '') ? [] : attackCues(event, actor, base)
    if (event.kind === 'cast' && isPrayerAction(event.abilityId))
        return prayerCastCues(event, actor, base)
    if (event.kind === 'heal' && (event.amount === undefined || event.amount > 0))
        return [{ ...base, kind: 'restore', count: 10 }]
    if (event.kind === 'revive') return [{ ...base, kind: 'revive', duration: 1000, count: 12 }]
    return impactCues(event, actor, base)
}
function attackCues(
    event: GameEventPayload,
    actor: CharacterSnapshot,
    base: Omit<EffectCue, 'kind'>
): EffectCue[] {
    if (!isArrowAbility(event.abilityId) || event.phase === undefined)
        return [attackCue(event, actor, base)]
    if (event.phase === 'completed' && event.projectile) return [attackCue(event, actor, base)]
    if (event.phase !== 'started' || event.abilityId !== 'sniper_shot') return []
    return [
        {
            ...base,
            kind: 'aim',
            fromId: actor.id,
            targetId: actor.id,
            duration: event.durationMs ?? ABILITY_DEFINITIONS.sniper_shot.windupMs,
            aimActionId: event.actionId,
            count: 0,
        },
    ]
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
                duration: event.durationMs ?? (event.target ? GRAVE_PURIFY_CAST_MS : 3000),
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
    if (event.kind === 'notice' && event.noticeKind === 'prayer_unanswered')
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
    if (event.kind === 'absorb' && (event.amount === undefined || event.amount > 0)) {
        const cues: EffectCue[] = [
            { ...base, kind: 'barrier', color: BARRIER_COLOR, duration: 250, count: 4 },
        ]
        return [...cues, ...prayerHit(event, actor, base)]
    }
    if (event.kind === 'damage' && (event.amount === undefined || event.amount > 0))
        return prayerHit(event, actor, base)
    return []
}
function prayerHit(
    event: GameEventPayload,
    actor: CharacterSnapshot,
    base: Omit<EffectCue, 'kind'>
): EffectCue[] {
    if (!isPrayerAction(event.abilityId)) return []
    return [
        {
            ...base,
            kind: 'wave',
            fromId: actor.id,
            targetId: actor.id,
            wave: true,
            radius: snapshotPrayerParameters(actor, event.abilityId).radius,
            duration: 550,
            count: 12,
        },
        { ...base, kind: 'prayer_hit', duration: 550, count: 8 },
    ]
}
export function eventCaption(event: GameEventPayload): string | undefined {
    const captions: Partial<Record<GameEventPayload['kind'], () => string | undefined>> = {
        heal: () => healingCaption(event),
        absorb: () =>
            event.amount === undefined
                ? tGame('game.canvas.barrier')
                : positiveAmount(event, `${tGame('game.canvas.barrier')} −`),
        miss: () => tGame('game.canvas.miss'),
        parry: () => tGame('game.canvas.parry'),
        notice: () =>
            isFloatingNotice(event) ? tLocalized(event.textMessage, event.text ?? '') : undefined,
        revive: () => tGame('game.canvas.revive'),
        status: () => statusCaption(event),
        cast: () => castCaption(event),
        world_damage: () =>
            event.amount !== undefined && event.amount <= 0 ? undefined : combatHitLabel(event),
        attack: () =>
            event.abilityId === 'skeleton_strike' ? tGame('game.canvas.skeletonStrike') : undefined,
    }
    return captions[event.kind]?.()
}
function statusCaption(event: GameEventPayload): string | undefined {
    if (event.statusId === 'stun') return tGame('game.canvas.stun')
    return event.statusId === 'defensive_stance' && event.expiresAt === undefined
        ? tGame('game.canvas.defense')
        : undefined
}
function positiveAmount(event: GameEventPayload, prefix: string): string | undefined {
    return event.amount && event.amount > 0
        ? `${prefix}${event.amount.toLocaleString(gameLocale.value, { maximumFractionDigits: 2 })}`
        : undefined
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
        ...(event.projectile ? { projectile: event.projectile } : {}),
        count: kind === 'arrow' ? 0 : 6,
    }
}

function attackDuration(event: GameEventPayload, kind: EffectShape): number {
    if (event.phase === 'completed' && event.projectile) {
        const { origin, endpoint } = event.projectile
        return Math.min(220, Math.max(50, Math.hypot(endpoint.x - origin.x, endpoint.y - origin.y)))
    }
    if (event.durationMs !== undefined) return event.durationMs
    if (event.abilityId) return ABILITY_DEFINITIONS[event.abilityId].windupMs
    if (kind === 'arrow') return ABILITY_DEFINITIONS.shot.windupMs
    if (kind === 'spark') return ABILITY_DEFINITIONS.spark.windupMs
    return 220
}

function healingCaption(event: GameEventPayload): string | undefined {
    if (event.amount === undefined) return tGame('game.canvas.recovery')
    const resource =
        event.text === 'mana' || event.text === 'energy' ? tGame(`game.canvas.${event.text}`) : 'HP'
    return positiveAmount(event, `${resource} +`)
}
function castCaption(event: GameEventPayload): string | undefined {
    if (event.phase === 'interrupted') return tGame('game.canvas.interrupted')
    if (event.phase === 'completed' && isPrayerAction(event.abilityId))
        return abilityName(event.abilityId)
    if (event.phase === 'started' && event.abilityId === 'skeleton_strike')
        return tGame('game.canvas.skeletonStrike')
    return undefined
}

function eventDeity(event: GameEventPayload, actor: CharacterSnapshot): DeityId {
    return isPrayerAction(event.abilityId)
        ? PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(event.abilityId)].deityId
        : (actor.progression?.deity.id ?? 'hearth')
}
