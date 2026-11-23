import { type GameEventPayload, THEFT_RULES } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ReactionAction } from './characterReactions'
import {
    canWitnessCombatant,
    type CombatContactObserver,
    publicCombatHit,
    recordCivicAssault,
} from './combatWitnesses'
import {
    availableConflictActions,
    canFight,
    canFlee,
    canReact,
    chooseObservedConflict,
    claimReaction,
    noticedTheftIncident,
    observedAttack,
    type ObservedConflict,
    warnConflict,
} from './npcConflictObservation'
import type { NpcConflictIdentity } from './npcConflictResponses'
import { NpcConflictTransitions } from './npcConflictTransitions'
import { planNpcCrimeReport } from './npcCrimeReport'
import type { GameRoom } from './room'
import type { SocialHistory } from './socialHistory'
import type { TheftContext, TheftService } from './theft'

export class NpcConflict {
    private readonly transitions = new NpcConflictTransitions()
    private readonly acted = new WeakMap<GameCharacter, Set<string>>()
    private readonly seenHits = new WeakMap<GameCharacter, Set<string>>()

    public constructor(
        private readonly room: GameRoom,
        private readonly theft: TheftService,
        private readonly history: SocialHistory,
        private readonly characters: () => Iterable<GameCharacter>,
        private readonly interrupt: CombatContactObserver
    ) {}

    public readonly onCaught = (
        thief: GameCharacter,
        victim: GameCharacter,
        context: TheftContext
    ): GameEventPayload[] | undefined => {
        const incident = noticedTheftIncident(thief, victim, context.now)
        return this.history.record(incident, [victim.id])
            ? this.choose(victim, thief, incident, context.random)
            : undefined
    }

    public readonly onCombat = (
        events: readonly GameEventPayload[],
        now: number
    ): GameEventPayload[] => {
        const fresh: GameEventPayload[] = []
        for (const event of events) {
            const hit = publicCombatHit(this.room, event)
            if (
                hit !== undefined &&
                claimReaction(this.seenHits, hit.target, hit.id)
            ) {
                this.interrupt(hit.attacker, hit.target, now)
                this.onDamage(event, now)
                fresh.push(event)
            }
        }
        return fresh
    }

    public readonly clearEvidence = (offender: GameCharacter): void =>
        this.transitions.clearOffender(offender)

    public readonly reconsider = (
        now: number,
        busy: (actor: GameCharacter) => boolean
    ): void => {
        this.transitions.update(now, busy)
    }

    public hasPhysicalReaction(actor: GameCharacter, now: number): boolean {
        return this.theft.reactions.controls(actor, now)
    }

    public availableForSpeech(
        actor: GameCharacter,
        offender: GameCharacter,
        now: number,
        reason: 'insult' | 'threat'
    ): ReactionAction[] {
        return this.hasPhysicalReaction(actor, now)
            ? ['wait']
            : this.actionsFor(actor, offender, now, reason, true)
    }

    public readonly apply = (
        actor: GameCharacter,
        offender: GameCharacter,
        action: ReactionAction,
        incident: NpcConflictIdentity,
        now: number,
        revision: string | number = 0
    ): GameEventPayload[] => {
        const speech = incident.kind === 'insult' || incident.kind === 'threat'
        if (
            !canReact(actor, offender, incident.locationId) ||
            (speech && this.hasPhysicalReaction(actor, now)) ||
            !claimReaction(
                this.acted,
                actor,
                JSON.stringify([incident.id, revision])
            )
        ) {
            return []
        }
        if (action === 'attack' || action === 'flee') {
            this.startMovement(actor, offender, action, incident, now, speech)
            return []
        }
        switch (action) {
            case 'warn':
                this.theft.reactions.cancelCombat(actor)
                return warnConflict(
                    this.room,
                    actor,
                    offender,
                    incident.kind,
                    now
                )
            case 'report':
                this.report(actor, offender, incident, now)
                return []
            case 'wait':
                this.theft.reactions.cancelCombat(actor)
                return []
            default:
                return []
        }
    }

    private startMovement(
        actor: GameCharacter,
        offender: GameCharacter,
        action: 'attack' | 'flee',
        incident: NpcConflictIdentity,
        now: number,
        speech: boolean
    ): void {
        const able =
            action === 'attack'
                ? canFight(actor, offender)
                : this.theft.reactions.fleeingFrom(actor, incident.id) ===
                      undefined && canFlee(this.room, actor, offender.position)
        if (able) {
            if (speech) {
                this.transitions.clearActor(actor)
            }
            this.theft.reactions.beginCombat(
                actor,
                offender,
                action === 'attack' ? 'fight' : 'flee',
                incident,
                now
            )
        }
    }

    private onDamage(event: GameEventPayload, now: number): void {
        const observation = observedAttack(
            this.room,
            this.characters(),
            event,
            now
        )
        if (observation === undefined) {
            return
        }
        const { attacker, victim, incident, victimSawAttacker, witnesses } =
            observation
        if (!this.history.record(incident, witnesses) || !victimSawAttacker) {
            return
        }
        recordCivicAssault(this.theft, attacker, victim, now)
        this.room.publishEvents(this.choose(victim, attacker, incident) ?? [])
    }

    private choose(
        actor: GameCharacter,
        offender: GameCharacter,
        incident: ObservedConflict,
        random?: () => number
    ): GameEventPayload[] | undefined {
        if (!actor.soul.canSpeak && incident.kind === 'theft') {
            return undefined
        }
        if (!canReact(actor, offender, incident.locationId)) {
            return []
        }
        const visible = (now: number) =>
            canWitnessCombatant(
                actor,
                offender,
                this.room.navigationFor(actor),
                THEFT_RULES.pursuitRadius,
                now
            )
        const lastKnown = () =>
            this.theft.reactions.fleeingFrom(actor, incident.id)
        const actions = (now: number) =>
            this.actionsFor(
                actor,
                offender,
                now,
                incident.kind,
                visible(now),
                lastKnown()
            )
        const resolve = (
            now: number,
            revision: string | number,
            rng?: () => number
        ) => {
            const action = chooseObservedConflict(
                this.room,
                this.history,
                actor,
                offender,
                incident,
                {
                    actions: actions(now),
                    now,
                    revision,
                    random: rng,
                }
            )
            return this.apply(actor, offender, action, incident, now, revision)
        }
        this.transitions.watch(actor, offender, incident.at, {
            actions,
            eligible: (now) =>
                canReact(actor, offender, incident.locationId) &&
                (visible(now) || lastKnown() !== undefined),
            paused: (now) =>
                !this.theft.reactions.canReconsider(actor, incident.id, now),
            decide: (now, revision) =>
                this.room.publishEvents(resolve(now, revision)),
        })
        return resolve(incident.at, 0, random)
    }

    private actionsFor(
        actor: GameCharacter,
        offender: GameCharacter,
        now: number,
        trigger: NpcConflictIdentity['kind'],
        visible: boolean,
        lastKnown?: GameCharacter['position']
    ): ReactionAction[] {
        return availableConflictActions(this.room, actor, offender, now, {
            visible,
            lastKnown,
            reportAvailable: () =>
                actor.soul.canSpeak &&
                (trigger === 'theft' || trigger === 'attack') &&
                this.reportOpportunity(actor, offender, trigger, now) !==
                    undefined,
        })
    }

    private report(
        actor: GameCharacter,
        offender: GameCharacter,
        incident: NpcConflictIdentity,
        now: number
    ): void {
        if (incident.kind !== 'theft' && incident.kind !== 'attack') {
            return
        }
        const opportunity = this.reportOpportunity(
            actor,
            offender,
            incident.kind,
            now
        )
        if (opportunity !== undefined) {
            this.theft.reactions.beginReport(
                actor,
                offender,
                opportunity.guard,
                incident.kind,
                opportunity.until
            )
        }
    }

    private reportOpportunity(
        actor: GameCharacter,
        offender: GameCharacter,
        offense: 'theft' | 'attack',
        now: number
    ) {
        return planNpcCrimeReport(
            actor,
            offender.id,
            this.theft.reportExpiry(actor.id, offender.id, offense),
            {
                characters: this.characters(),
                navigation: this.room.navigationFor(actor),
                now,
            }
        )
    }
}
