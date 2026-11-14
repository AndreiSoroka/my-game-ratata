import { workshopFor } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CharacterController } from './controllers'
import type { GameRoom } from './room'

export type BuiltinPolicyId =
    'hostile' | 'worker' | 'artisan' | 'cleric' | 'companion'
export interface PolicyIntention {
    kind: 'policy'
    actorId: string
    policyId: BuiltinPolicyId
}

/** Compatibility tasks are server-owned and never accepted from scenario/client data. */
export class ScenarioPolicies {
    private readonly pending = new Map<string, PolicyIntention>()
    private readonly executedAt = new Map<string, number>()
    private readonly registered = new Map<
        string,
        { policyId: BuiltinPolicyId; controller: CharacterController }
    >()

    public advance(
        actor: GameCharacter,
        controller: CharacterController,
        room: GameRoom,
        now: number
    ): boolean {
        if (!available(actor) || this.executedAt.get(actor.id) === now) {
            return false
        }
        const policyId = policyFor(actor)
        this.registered.set(actor.id, { policyId, controller })
        if (!this.pending.has(actor.id)) {
            this.pending.set(actor.id, {
                kind: 'policy',
                actorId: actor.id,
                policyId,
            })
        }
        const task = this.pending.get(actor.id)
        if (task === undefined) {
            return false
        }
        const registered = this.registered.get(task.actorId)
        this.pending.delete(actor.id)
        if (registered?.policyId !== task.policyId) {
            return false
        }
        this.executedAt.set(actor.id, now)
        // The retained strategy chooses ordinary intentions; shared domain services
        // and the normal movement/combat/lifecycle tick resolve every consequence.
        registered.controller.update(actor, room, now)
        return true
    }

    public reconcile(characters: ReadonlyMap<string, GameCharacter>): void {
        for (const id of this.pending.keys()) {
            if (!characters.has(id)) {
                this.pending.delete(id)
            }
        }
        for (const id of this.executedAt.keys()) {
            if (!characters.has(id)) {
                this.executedAt.delete(id)
            }
        }
        for (const id of this.registered.keys()) {
            if (!characters.has(id)) {
                this.registered.delete(id)
            }
        }
    }
}

function available(actor: GameCharacter): boolean {
    return (
        actor.controllerKind !== 'network_player' &&
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        actor.soul.controlSource !== 'human'
    )
}

function policyFor(actor: GameCharacter): BuiltinPolicyId {
    if (actor.faction === 'monsters') {
        return 'hostile'
    }
    if ([...actor.tags].some((tag) => tag.startsWith('worker.'))) {
        return 'worker'
    }
    if (workshopFor(actor.id) !== undefined) {
        return 'artisan'
    }
    if (actor.tags.has('cleric')) {
        return 'cleric'
    }
    return 'companion'
}
