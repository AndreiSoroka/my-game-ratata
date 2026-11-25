import type { GameCharacter } from './character'
import type { CharacterController } from './controllers'
import {
    advanceNecromancerHeartRite,
    canActAsNecromancer,
    moveNecromancer,
    performNecromancerCombatIntent,
    performNecromancerTactic,
} from './necromancerActions'
import {
    aidWoundedSkeleton,
    defendNecromancer,
    needsNecromancerSafety,
    seekNecromancerSafety,
    tryNecromancerAid,
    updateNecromancerEscort,
} from './necromancerDefense'
import {
    localNecromancerOptions,
    necromancerOptions,
} from './necromancerOptions'
import {
    type NecromancerOffer,
    NecromancerPlanning,
} from './necromancerPlanning'
import { NecromancerRetinue } from './necromancerRetinue'
import { NecromancerScenario } from './necromancerScenario'
import { NecromancerSpeech } from './necromancerSpeech'
import {
    type NecromancerModelDecision,
    type NecromancerOption,
    type NecromancerRefuge,
    type NecromancerScene,
    observeNecromancerScene,
} from './necromancerTactics'
import type { GameRoom } from './room'

const controllers = new WeakMap<GameCharacter, NecromancerController>()

export const necromancerController = controllers.get.bind(controllers)

export class NecromancerController implements CharacterController {
    public readonly observesWhileCasting = true
    private readonly planning = new NecromancerPlanning()
    private readonly speech = new NecromancerSpeech()
    public readonly journal = this.planning.journal
    private readonly offeredHelp = new Set<string>()
    private nextStepAt = -Infinity
    private recovering = false
    private activity = 0
    private scene: NecromancerScene | undefined
    private readonly retinue: NecromancerRetinue
    private readonly scenario: NecromancerScenario

    public constructor(private readonly refuge: NecromancerRefuge) {
        this.retinue = new NecromancerRetinue(refuge)
        this.scenario = new NecromancerScenario(refuge.home)
    }

    public update(actor: GameCharacter, room: GameRoom, now: number): void {
        controllers.set(actor, this)
        if (
            !actor.alive ||
            actor.tags.has('offline') ||
            now < this.nextStepAt
        ) {
            return
        }
        this.nextStepAt = now + 300
        const scene = observeNecromancerScene(actor, room, now)
        this.scene = scene
        updateNecromancerEscort(actor, scene, now)
        this.planning.observe(scene, now)
        const remark = this.planning.accept(
            actor,
            scene,
            () => this.options(actor, room, scene, now),
            now,
            (edit, offer) => this.scenario.queueEdit(edit, offer)
        )
        this.speech.advance(actor, room, scene, now, remark)
        if (canActAsNecromancer(actor, now)) {
            this.scenario.applyPending(actor, scene, now)
            this.act(actor, room, scene, now)
        }
    }

    public offer(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): NecromancerOffer | undefined {
        const scene = this.scene
        if (scene === undefined) {
            return undefined
        }
        const woundedVisitor =
            scene.playerId !== undefined &&
            !this.offeredHelp.has(scene.playerId)
        const phase = this.planning.due(
            actor,
            scene,
            this.activity,
            woundedVisitor,
            now
        )
        if (phase === undefined) {
            return undefined
        }
        const findings = [...this.scenario.visited.values()].filter(
            (clue) => clue !== undefined
        )
        const offer = this.planning.offer(
            actor,
            room,
            scene,
            phase,
            this.activity,
            findings,
            this.options(actor, room, scene, now),
            now
        )
        offer.context.scenario = this.scenarioObservation(actor)
        return offer
    }

    public reserve(offer: NecromancerOffer): void {
        this.planning.reserve(offer)
    }

    public queueReply(
        offer: NecromancerOffer,
        reply: NecromancerModelDecision
    ): void {
        this.planning.queueReply(offer, reply)
    }

    public discardPendingAdvice(): void {
        this.planning.discardPendingAdvice()
        this.scenario.discardPending()
    }

    public scenarioObservation(
        actor: GameCharacter
    ): NonNullable<NecromancerOffer['context']['scenario']> {
        return this.scenario.observe(actor)
    }

    private options(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        now: number
    ): NecromancerOption[] {
        return necromancerOptions(
            actor,
            room,
            scene,
            {
                favoriteId: this.planning.favoriteId,
                offeredHelp: this.offeredHelp,
                ...(this.scenario.visited.size >= this.refuge.landmarks.length
                    ? { questChest: this.refuge.chestId }
                    : {}),
            },
            now
        )
    }

    private act(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        now: number
    ): void {
        if (aidWoundedSkeleton(actor, room, scene, now)) {
            return
        }
        if (scene.threat === undefined && this.recovering) {
            if (actor.hp < actor.maxHp * 0.8 || actor.hasPath()) {
                return
            }
            this.recovering = false
        }
        if (
            scene.threat === undefined &&
            this.retinue.replenish(actor, room, scene, now)
        ) {
            return
        }
        if (this.applyPlan(actor, room, scene, now)) {
            return
        }
        const options = localNecromancerOptions(actor, room, scene, now)
        if (scene.threat !== undefined) {
            defendNecromancer(actor, room, scene, scene.threat, options, now)
            return
        }
        if (
            !tryNecromancerAid(actor, room, options, now) &&
            this.scenario.study(actor, room, this.refuge.landmarks, now)
        ) {
            this.activity += 1
        }
    }

    private applyPlan(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        now: number
    ): boolean {
        const plan = this.planning.plan
        if (scene.threat !== undefined) {
            return this.applyCombatPlan(
                actor,
                room,
                scene,
                scene.threat,
                plan,
                now
            )
        }
        if (plan === undefined) {
            return false
        }
        if (plan.tactic === 'rest' || plan.tactic === 'keep_distance') {
            if (!moveNecromancer(actor, room, this.refuge.home, false, now)) {
                this.planning.plan = undefined
                this.scenario.nextRestAt = now + 5_000
                this.activity += 1
            }
            return true
        }
        if (plan.tactic === 'heart' && plan.targetId !== undefined) {
            if (!advanceNecromancerHeartRite(actor, room, plan.targetId, now)) {
                this.planning.plan = undefined
            }
            return true
        }
        if (plan.tactic === 'offer_help') {
            this.planning.plan = undefined
            if (
                plan.targetId !== undefined &&
                plan.targetId === scene.playerId
            ) {
                this.offeredHelp.add(plan.targetId)
            }
            return true
        }
        return this.applyTargetedPlan(actor, room, plan, now)
    }

    private applyCombatPlan(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        threat: GameCharacter,
        plan: NecromancerOption | undefined,
        now: number
    ): boolean {
        if (
            this.recovering ||
            needsNecromancerSafety(actor, scene, now) ||
            plan?.tactic === 'retreat' ||
            plan?.tactic === 'hide'
        ) {
            this.recovering = true
            this.scenario.quiet()
            seekNecromancerSafety(
                actor,
                room,
                scene,
                threat,
                this.refuge.home,
                plan?.tactic === 'hide',
                now
            )
            return true
        }
        if (this.scenario.combat(actor, room, threat, now)) {
            return true
        }
        return (
            (plan !== undefined &&
                performNecromancerCombatIntent(
                    actor,
                    room,
                    scene,
                    threat,
                    plan,
                    now
                )) ||
            this.applyTargetedPlan(actor, room, plan, now)
        )
    }

    private applyTargetedPlan(
        actor: GameCharacter,
        room: GameRoom,
        plan: NecromancerOption | undefined,
        now: number
    ): boolean {
        const targeted = plan?.targetId !== undefined
        if (targeted && plan.tactic !== 'magic') {
            this.planning.plan = undefined
        }
        return targeted && performNecromancerTactic(actor, room, plan, now)
    }
}
