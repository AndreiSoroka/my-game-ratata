import type { GameCharacter } from './character'
import type { CharacterController } from './controllers'
import {
    advanceNecromancerHeartRite,
    approachStudyLandmark,
    fightAsNecromancer,
    moveNecromancer,
    necromancerOffersHelp,
    performNecromancerTactic,
} from './necromancerActions'
import {
    defendNecromancer,
    needsNecromancerSafety,
    seekNecromancerSafety,
} from './necromancerDefense'
import {
    localNecromancerOptions,
    necromancerOptions,
} from './necromancerOptions'
import {
    type NecromancerOffer,
    NecromancerPlanning,
} from './necromancerPlanning'
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
    private readonly visited = new Map<string, string | undefined>()
    private readonly offeredHelp = new Set<string>()
    private nextStepAt = -Infinity
    private nextRestAt = -Infinity
    private recovering = false
    private activity = 0
    private scene: NecromancerScene | undefined

    public constructor(private readonly refuge: NecromancerRefuge) {}

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
        this.planning.observe(scene, now)
        const bark = this.planning.accept(
            actor,
            scene,
            () => this.options(actor, room, scene, now),
            now
        )
        this.speech.advance(actor, room, scene, now, bark)
        if (
            !actor.isActionLocked(now) &&
            actor.movement.dashUntil <= now &&
            actor.abilities.casting === null
        ) {
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
        const findings = [...this.visited.values()].filter(
            (clue) => clue !== undefined
        )
        return this.planning.offer(
            actor,
            room,
            scene,
            phase,
            this.activity,
            findings,
            this.options(actor, room, scene, now),
            now
        )
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
                ...(this.visited.size >= this.refuge.landmarks.length
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
        if (scene.threat === undefined && this.recovering) {
            if (actor.hp < actor.maxHp * 0.8 || actor.hasPath()) {
                return
            }
            this.recovering = false
        }
        if (this.applyPlan(actor, room, scene, now)) {
            return
        }
        const options = localNecromancerOptions(actor, room, scene, now)
        if (scene.threat !== undefined) {
            defendNecromancer(actor, room, scene, scene.threat, options, now)
            return
        }
        const aid = options.find(
            ({ tactic }) => tactic === 'revive' || tactic === 'heal'
        )
        if (
            aid !== undefined &&
            performNecromancerTactic(actor, room, aid, now)
        ) {
            return
        }
        this.study(actor, room, now)
        this.speech.thinkAloud(
            actor,
            room,
            scene,
            this.journal.at(-1)?.note,
            now
        )
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
                this.nextRestAt = now + 5_000
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
            return necromancerOffersHelp(
                actor,
                room,
                plan.targetId,
                scene.playerId,
                this.offeredHelp
            )
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
        if (plan?.tactic === 'fight' && plan.targetId === threat.id) {
            fightAsNecromancer(actor, room, threat, now)
            return true
        }
        return this.applyTargetedPlan(actor, room, plan, now)
    }

    private applyTargetedPlan(
        actor: GameCharacter,
        room: GameRoom,
        plan: NecromancerOption | undefined,
        now: number
    ): boolean {
        if (plan?.targetId === undefined) {
            return false
        }
        if (plan.tactic !== 'magic') {
            this.planning.plan = undefined
        }
        return performNecromancerTactic(actor, room, plan, now)
    }

    private study(actor: GameCharacter, room: GameRoom, now: number): void {
        if (now < this.nextRestAt) {
            return
        }
        const next = this.refuge.landmarks.find(
            ({ id }) => !this.visited.has(id)
        )
        if (next === undefined) {
            if (!moveNecromancer(actor, room, this.refuge.home, false, now)) {
                this.nextRestAt = now + 30_000
                this.activity += 1
            }
            return
        }
        if (approachStudyLandmark(actor, room, next, now)) {
            this.visited.set(next.id, next.ashClue)
            this.activity += 1
        }
    }
}
