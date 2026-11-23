import {
    healthPercent,
    type HealthSnapshot,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { observeForeignHealth } from './combatObservation'
import { canTargetByFaction } from './factions'
import { distance, normalize } from './math'
import type { NavigationService } from './navigation'
import type { NecromancerBark } from './necromancerSpeech'
import { visibilityRadius } from './queries'
import type { GameRoom } from './room'

export type NecromancerTactic =
    | 'study'
    | 'rest'
    | 'retreat'
    | 'hide'
    | 'fight'
    | 'magic'
    | 'heal'
    | 'revive'
    | 'raise'
    | 'guard'
    | 'protect'
    | 'wander'
    | 'hunt'
    | 'offer_help'
    | 'keep_distance'
    | 'favorite'
    | 'gift'
    | 'sacrifice'
    | 'heart'

export interface NecromancerOption {
    tactic: NecromancerTactic
    targetId?: string
}

export interface NecromancerModelContext {
    actorId: string
    phase: 'peace' | 'combat'
    self: { hp: number; maxHp: number; mana: number }
    goal: string
    findings: string[]
    playerHealth: Array<{ id: string; health: HealthSnapshot }>
    threats: Array<{ id: string; distanceCells: number; type: string }>
    cover: boolean
    favorite?: string
    plan?: NecromancerOption
    lastNote?: string
    options: NecromancerOption[]
}

export interface NecromancerModelDecision {
    choice: number
    note: string
    bark?: NecromancerBark
}

export interface NecromancerJournalEntry extends NecromancerOption {
    at: number
    note: string
}

export interface NecromancerLandmark {
    id: string
    position: Vector2
    ashClue?: string
}

export interface NecromancerRefuge {
    home: Vector2
    landmarks: readonly NecromancerLandmark[]
    chestId: string
}

export interface NecromancerScene {
    locationId: string
    deathSequence: number
    observedAt: number
    visible: GameCharacter[]
    threat: GameCharacter | undefined
    corpseId: string | undefined
    cover: ReturnType<typeof necromancerCover>
    playerId: string | undefined
}

export const necromancerStudyGoal =
    'Узнать имена трёх павших стражей и причину их незавершённого дозора. Затем реши, стоит ли стать личом.'

const sightRadius = 128

export function observeNecromancerScene(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): NecromancerScene {
    const visible = visibleNecromancerNeighbors(actor, room, now)
    const threat = necromancerThreats(actor, visible, now)[0]
    const navigation = room.navigationFor(actor)
    let cover: NecromancerScene['cover'] | null = null
    return {
        locationId: actor.locationId,
        deathSequence: actor.deathSequence,
        observedAt: now,
        visible,
        threat,
        corpseId: actor.abilities.known.has('ash_raise')
            ? room.raisableCorpseFor(actor, now)
            : undefined,
        get cover() {
            if (cover === null) {
                cover =
                    threat === undefined
                        ? undefined
                        : necromancerCover(actor, threat, navigation)
            }
            return cover
        },
        playerId: nearbyWoundedVisitor(actor, visible, now),
    }
}

function nearbyWoundedVisitor(
    actor: GameCharacter,
    visible: GameCharacter[],
    now: number
): string | undefined {
    return visible.find(
        (target) =>
            target.connected &&
            target.alive &&
            distance(actor.position, target.position) <= 80 &&
            !canTargetByFaction(actor, target, now) &&
            healthPercent(observeForeignHealth(actor, target)) <= 45
    )?.id
}

function visibleNecromancerNeighbors(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): GameCharacter[] {
    const navigation = room.navigationFor(actor)
    return room
        .charactersFor(actor)
        .filter(
            (target) =>
                target.id !== actor.id &&
                target.trainingTarget === undefined &&
                !target.tags.has('offline') &&
                !target.tags.has('state.retired') &&
                distance(actor.position, target.position) <=
                    visibilityRadius(actor, target, sightRadius, now) &&
                navigation.hasLineOfSight(actor.position, target.position)
        )
        .sort((a, b) => {
            const difference =
                distance(actor.position, a.position) -
                distance(actor.position, b.position)
            return difference === 0 ? a.id.localeCompare(b.id) : difference
        })
}

export function necromancerThreats(
    actor: GameCharacter,
    visible: GameCharacter[],
    now: number
): GameCharacter[] {
    return visible.filter(
        (target) => target.alive && canTargetByFaction(actor, target, now)
    )
}

export function necromancerCover(
    actor: GameCharacter,
    threat: GameCharacter,
    navigation: NavigationService
): { position: Vector2; concealed: boolean } | undefined {
    const direction = normalize({
        x: actor.position.x - threat.position.x,
        y: actor.position.y - threat.position.y,
    })
    const side = { x: -direction.y, y: direction.x }
    const width = navigation.grid.tileWidth
    const candidates = [0, 2, -2, 4, -4].map((offset) => ({
        x: actor.position.x + width * (direction.x * 4 + side.x * offset),
        y: actor.position.y + width * (direction.y * 4 + side.y * offset),
    }))
    const reachable = candidates.flatMap((point) => {
        const path = navigation.findPathWorld(actor.position, point)
        const end = path.at(-1)
        return end === undefined ||
            distance(end, threat.position) <=
                distance(actor.position, threat.position)
            ? []
            : [end]
    })
    const cover = reachable.find(
        (point) => !navigation.hasLineOfSight(threat.position, point)
    )
    const position = cover ?? reachable[0]
    return position === undefined
        ? undefined
        : { position, concealed: cover !== undefined }
}
