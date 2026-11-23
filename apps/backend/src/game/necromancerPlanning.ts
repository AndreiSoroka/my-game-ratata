import type { GameCharacter } from './character'
import { observeForeignHealth } from './combatObservation'
import { distance } from './math'
import { isNecromancerBark, type NecromancerBark } from './necromancerSpeech'
import {
    type NecromancerJournalEntry,
    type NecromancerModelContext,
    type NecromancerModelDecision,
    type NecromancerOption,
    type NecromancerScene,
    necromancerStudyGoal,
    necromancerThreats,
} from './necromancerTactics'
import type { GameRoom } from './room'

const combatQuietMs = 8_000
const combatTactics = new Set(['fight', 'hide', 'retreat', 'magic'])

type Phase = NecromancerModelContext['phase']

export interface NecromancerOffer {
    context: NecromancerModelContext
    encounter: number
    activity: number
    deathSequence: number
    locationId: string
    startedAt: number
}

export class NecromancerPlanning {
    public readonly journal: NecromancerJournalEntry[] = []
    public favoriteId: string | undefined
    public plan: NecromancerOption | undefined
    private lastThreatAt = -Infinity
    private encounter = 0
    private battleCalls = 0
    private lastCombatCall = -Infinity
    private lastPeaceCall = -Infinity
    private reviewedActivity = 0
    private pending:
        { offer: NecromancerOffer; reply: NecromancerModelDecision } | undefined

    public observe(scene: NecromancerScene, now: number): void {
        if (now > this.lastThreatAt + combatQuietMs) {
            if (
                this.plan !== undefined &&
                combatTactics.has(this.plan.tactic)
            ) {
                this.plan = undefined
            }
            if (scene.threat !== undefined) {
                this.encounter += 1
                this.battleCalls = 0
            }
        }
        if (scene.threat !== undefined) {
            this.lastThreatAt = now
        }
    }

    public due(
        actor: GameCharacter,
        scene: NecromancerScene,
        activity: number,
        woundedVisitor: boolean,
        now: number
    ): Phase | undefined {
        if (!freshScene(actor, scene, now) || this.pending !== undefined) {
            return undefined
        }
        if (now <= this.lastThreatAt + combatQuietMs) {
            return this.battleDue(actor, scene, now) ? 'combat' : undefined
        }
        return (woundedVisitor || activity !== this.reviewedActivity) &&
            now >= this.lastPeaceCall + 300_000
            ? 'peace'
            : undefined
    }

    private battleDue(
        actor: GameCharacter,
        scene: NecromancerScene,
        now: number
    ): boolean {
        return (
            scene.threat !== undefined &&
            this.battleCalls < 2 &&
            now >= this.lastCombatCall + 30_000 &&
            (this.battleCalls === 0 ||
                actor.hp <= actor.maxHp * 0.5 ||
                scene.corpseId !== undefined)
        )
    }

    public offer(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        phase: Phase,
        activity: number,
        findings: string[],
        options: NecromancerOption[],
        now: number
    ): NecromancerOffer {
        const recentNote = this.journal.at(-1)?.note
        return {
            activity,
            encounter: this.encounter,
            deathSequence: actor.deathSequence,
            locationId: actor.locationId,
            startedAt: now,
            context: {
                actorId: actor.id,
                phase,
                self: { hp: actor.hp, maxHp: actor.maxHp, mana: actor.mana },
                goal: necromancerStudyGoal,
                findings,
                playerHealth: visiblePlayerHealth(actor, scene),
                threats: visibleThreats(actor, room, scene, now),
                cover: scene.cover?.concealed === true,
                ...(recentNote !== undefined && recentNote.length > 0
                    ? { lastNote: recentNote }
                    : {}),
                ...(this.favoriteId === undefined
                    ? {}
                    : { favorite: this.favoriteId }),
                ...(this.plan === undefined ? {} : { plan: this.plan }),
                options,
            },
        }
    }

    public reserve(offer: NecromancerOffer): void {
        if (offer.context.phase === 'combat') {
            this.battleCalls += 1
            this.lastCombatCall = offer.startedAt
        } else {
            this.reviewedActivity = offer.activity
            this.lastPeaceCall = offer.startedAt
        }
    }

    public queueReply(
        offer: NecromancerOffer,
        reply: NecromancerModelDecision
    ): void {
        this.pending = { offer, reply }
    }

    public accept(
        actor: GameCharacter,
        scene: NecromancerScene,
        options: () => NecromancerOption[],
        now: number
    ): NecromancerBark | undefined {
        const pending = this.pending
        this.pending = undefined
        if (
            pending === undefined ||
            !this.currentOffer(pending.offer, actor, scene, now)
        ) {
            return
        }
        const { offer, reply } = pending
        const option = Number.isInteger(reply.choice)
            ? offer.context.options[reply.choice]
            : undefined
        if (
            option === undefined ||
            !options().some(
                (current) =>
                    current.tactic === option.tactic &&
                    current.targetId === option.targetId
            )
        ) {
            return
        }
        const note =
            typeof reply.note === 'string'
                ? reply.note.replace(/\s+/gu, ' ').trim().slice(0, 140)
                : ''
        this.journal.push({ at: now, ...option, note })
        if (this.journal.length > 96) {
            this.journal.shift()
        }
        if (option.tactic === 'favorite') {
            this.favoriteId = option.targetId
        } else {
            this.plan = option
        }
        return scene.threat !== undefined && isNecromancerBark(reply.bark)
            ? reply.bark
            : undefined
    }

    private currentOffer(
        offer: NecromancerOffer,
        actor: GameCharacter,
        scene: NecromancerScene,
        now: number
    ): boolean {
        return (
            offer.deathSequence === actor.deathSequence &&
            offer.locationId === actor.locationId &&
            offer.encounter === this.encounter &&
            now <= offer.startedAt + 45_000 &&
            (offer.context.phase === 'combat') === (scene.threat !== undefined)
        )
    }
}

function freshScene(
    actor: GameCharacter,
    scene: NecromancerScene,
    now: number
): boolean {
    return (
        actor.alive &&
        actor.locationId === scene.locationId &&
        actor.deathSequence === scene.deathSequence &&
        now <= scene.observedAt + 900
    )
}

function visiblePlayerHealth(
    actor: GameCharacter,
    scene: NecromancerScene
): NecromancerModelContext['playerHealth'] {
    return scene.visible
        .filter((target) => target.connected && target.alive)
        .slice(0, 4)
        .map((target) => ({
            id: target.id,
            health: observeForeignHealth(actor, target),
        }))
}

function visibleThreats(
    actor: GameCharacter,
    room: GameRoom,
    scene: NecromancerScene,
    now: number
): NecromancerModelContext['threats'] {
    const width = room.navigationFor(actor).grid.tileWidth
    return necromancerThreats(actor, scene.visible, now)
        .slice(0, 4)
        .map((target) => ({
            id: target.id,
            distanceCells: Math.ceil(
                distance(actor.position, target.position) / width
            ),
            type: target.creatureType,
        }))
}
