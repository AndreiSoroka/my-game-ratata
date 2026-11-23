import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import {
    type NecromancerController,
    necromancerController,
} from '../game/necromancerController'
import type { NecromancerOffer } from '../game/necromancerPlanning'
import type { GameRoom } from '../game/room'
import type { NpcAiConfig, NpcAiModelSettings, NpcAiProvider } from './types'

interface RunningTurn {
    actor: GameCharacter
    token: string
    abort: AbortController
    deadline: number
    locationId: string
    deathSequence: number
}

/** Advice uses the room scheduler and an explicitly nonexclusive model lease. */
export class NecromancerTurns {
    private readonly calls = new Map<string, number[]>()
    private readonly configured: NpcAiConfig['npcs']
    private running: RunningTurn | undefined

    public constructor(
        private readonly room: GameRoom,
        private readonly companions: CompanionService,
        private readonly config: NpcAiConfig,
        private readonly provider: NpcAiProvider,
        private readonly clock: () => number,
        private readonly nextId: (kind: string) => string,
        private readonly wallClock = Date.now
    ) {
        this.configured = config.npcs.filter(
            (npc) => npc.role === 'necromancer' && npc.mode !== 'dialogue_only'
        )
    }

    public begin(now: number): Promise<void> | undefined {
        if (
            this.config.proactive === false ||
            this.provider.decideNecromancer === undefined
        ) {
            return undefined
        }
        for (const npc of this.configured) {
            const actor = this.availableActor(npc.actorId)
            if (actor === undefined) {
                continue
            }
            const wall = this.wallClock()
            const calls = (this.calls.get(actor.id) ?? []).filter(
                (at) => at > wall - 3_600_000
            )
            if (calls.length >= 8) {
                continue
            }
            const controller = necromancerController(actor)
            const offer = controller?.offer(actor, this.room, now)
            if (controller === undefined || offer === undefined) {
                continue
            }
            const token = this.nextId('ash-advice')
            if (!this.companions.claimModelControl(actor, token, now, false)) {
                continue
            }
            controller.reserve(offer)
            this.calls.set(actor.id, [...calls, wall])
            return this.launch(actor, token, controller, offer, npc.settings)
        }
        return undefined
    }

    private availableActor(id: string): GameCharacter | undefined {
        const actor = this.room.getCharacter(id)
        return actor !== undefined &&
            actor.alive &&
            this.room.allowsAutonomousNpcAi()
            ? actor
            : undefined
    }

    private async launch(
        actor: GameCharacter,
        token: string,
        controller: NecromancerController,
        offer: NecromancerOffer,
        defaults: NpcAiModelSettings
    ): Promise<void> {
        const abort = new AbortController()
        const settings = {
            ...defaults,
            timeoutMs: Math.min(defaults.timeoutMs, 30_000),
        }
        const turn: RunningTurn = {
            actor,
            token,
            abort,
            deadline: this.wallClock() + settings.timeoutMs,
            locationId: actor.locationId,
            deathSequence: actor.deathSequence,
        }
        this.running = turn
        try {
            const cancelled = new Promise<undefined>((resolve) => {
                abort.signal.addEventListener(
                    'abort',
                    () => resolve(undefined),
                    { once: true }
                )
            })
            const reply = await Promise.race([
                this.provider.decideNecromancer?.(
                    {
                        ...offer.context,
                        ...this.room.social.npcSpeech.turns.departures.take(
                            actor
                        ),
                    },
                    settings,
                    abort.signal
                ),
                cancelled,
            ])
            if (
                !abort.signal.aborted &&
                reply !== undefined &&
                this.valid(turn)
            ) {
                controller.queueReply(offer, reply)
            }
        } catch {
            // The accepted local plan continues and the next review has its usual cadence.
        } finally {
            if (this.running === turn) {
                this.running = undefined
            }
            this.companions.releaseModelControl(
                actor,
                token,
                this.room,
                this.clock()
            )
        }
    }

    public maintain(now: number): void {
        const running = this.running
        if (
            running !== undefined &&
            (this.wallClock() >= running.deadline ||
                !this.valid(running) ||
                !this.companions.renewModelControl(
                    running.actor,
                    running.token,
                    now
                ))
        ) {
            this.cancel(running, now)
        }
    }

    public stop(): void {
        if (this.running !== undefined) {
            this.cancel(this.running, this.clock())
        }
    }

    public interrupt(): void {
        this.stop()
        for (const npc of this.configured) {
            const actor = this.room.getCharacter(npc.actorId)
            if (actor !== undefined) {
                necromancerController(actor)?.discardPendingAdvice()
            }
        }
    }

    private cancel(running: RunningTurn, now: number): void {
        running.abort.abort()
        this.companions.releaseModelControl(
            running.actor,
            running.token,
            this.room,
            now
        )
    }

    private valid(running: RunningTurn): boolean {
        const { actor } = running
        return (
            this.room.allowsAutonomousNpcAi() &&
            this.room.getCharacter(actor.id) === actor &&
            actor.alive &&
            actor.deathSequence === running.deathSequence &&
            actor.locationId === running.locationId &&
            !actor.tags.has('offline') &&
            !actor.tags.has('state.retired')
        )
    }
}
