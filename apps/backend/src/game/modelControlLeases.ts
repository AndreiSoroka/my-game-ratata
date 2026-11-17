import type { AgentDecision } from '@my-game-ratata/contracts'

import type { CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { setCharacterControlSource } from './characterSoul'
import { cancelMovementMode } from './movementActions'
import { prepareConstellationLayout } from './personalConstellationSky'
import { isAutomationCommand } from './scenarioCommands'

const modelLeaseMs = 5_000

interface ModelLease {
    character: GameCharacter
    deathSequence: number
    until: number
    blocksScenario: boolean
    ownerToken?: string
}

/** Model ownership is scoped to one living actor and expires without a heartbeat. */
export class ModelControlLeases {
    private readonly leases = new Map<string, ModelLease>()

    public canDecide(
        character: GameCharacter,
        ownerToken: string | undefined,
        world: CompanionWorld,
        now: number
    ): boolean {
        const active = this.hasActiveLease(character, now, world)
        const lease = this.leases.get(character.id)
        return ownerToken === undefined
            ? !active || lease?.ownerToken === undefined
            : active && lease?.ownerToken === ownerToken
    }

    public recordDecision(
        character: GameCharacter,
        decision: AgentDecision,
        now: number,
        ownerToken?: string
    ): void {
        if (ownerToken !== undefined) {
            this.renewModelControl(character, ownerToken, now)
            return
        }
        if (decision.type === 'wait') {
            this.leases.delete(character.id)
            setCharacterControlSource(character, 'script')
            return
        }
        prepareConstellationLayout(character)
        this.leases.set(character.id, {
            character,
            deathSequence: character.deathSequence,
            until: now + modelLeaseMs,
            blocksScenario:
                decision.type !== 'speak' &&
                !isAutomationCommand(decision.type),
        })
        setCharacterControlSource(character, 'model')
    }

    /** The controller renews its claim independently from model inference. */
    public claimModelControl(
        character: GameCharacter,
        ownerToken: string,
        now: number,
        exclusive = true
    ): boolean {
        if (ownerToken.length === 0 || !modelControlAvailable(character)) {
            return false
        }
        if (this.hasActiveLease(character, now)) {
            return this.leases.get(character.id)?.ownerToken === ownerToken
                ? this.renewModelControl(character, ownerToken, now)
                : false
        }
        this.leases.set(character.id, {
            character,
            deathSequence: character.deathSequence,
            until: now + modelLeaseMs,
            blocksScenario: exclusive,
            ownerToken,
        })
        setCharacterControlSource(character, 'model')
        return true
    }

    public renewModelControl(
        character: GameCharacter,
        ownerToken: string,
        now: number
    ): boolean {
        if (!this.isModelControlOwner(character, ownerToken, now)) {
            return false
        }
        const lease = this.leases.get(character.id)
        if (lease === undefined) {
            return false
        }
        lease.until = now + modelLeaseMs
        return true
    }

    public setExclusive(
        character: GameCharacter,
        ownerToken: string,
        exclusive: boolean,
        now: number
    ): boolean {
        if (!this.isModelControlOwner(character, ownerToken, now)) {
            return false
        }
        const lease = this.leases.get(character.id)
        if (lease === undefined) {
            return false
        }
        lease.blocksScenario = exclusive
        return true
    }

    public releaseModelControl(
        character: GameCharacter,
        ownerToken: string,
        world: CompanionWorld,
        now: number
    ): void {
        const lease = this.leases.get(character.id)
        if (lease?.character !== character || lease.ownerToken !== ownerToken) {
            return
        }
        this.endLease(character.id, lease, world, now)
    }

    public isModelControlOwner(
        character: GameCharacter,
        ownerToken: string,
        now: number
    ): boolean {
        return (
            this.hasActiveLease(character, now) &&
            this.leases.get(character.id)?.ownerToken === ownerToken
        )
    }

    public hasActiveLease(
        character: GameCharacter,
        now: number,
        world?: CompanionWorld
    ): boolean {
        const lease = this.leases.get(character.id)
        if (lease === undefined) {
            return false
        }
        if (
            lease.until > now &&
            lease.character === character &&
            lease.deathSequence === character.deathSequence &&
            modelControlAvailable(character)
        ) {
            return true
        }
        this.endLease(character.id, lease, world, now)
        return false
    }

    public blocksScenario(
        character: GameCharacter,
        now: number,
        world?: CompanionWorld
    ): boolean {
        return (
            this.hasActiveLease(character, now, world) &&
            this.leases.get(character.id)?.blocksScenario === true
        )
    }

    private endLease(
        id: string,
        lease: ModelLease,
        world: CompanionWorld | undefined,
        now: number
    ): void {
        this.leases.delete(id)
        const character = lease.character
        if (
            character.controllerKind === 'network_player' ||
            character.soul.controlSource === 'human'
        ) {
            return
        }
        setCharacterControlSource(character, 'script')
        if (lease.blocksScenario) {
            world?.requestControl?.(character, { type: 'cancel_control' }, now)
            cancelCharacterControl(character)
            cancelMovementMode(character)
            character.setMoveInput({ x: 0, y: 0 })
            character.clearPath()
        }
    }
}

function modelControlAvailable(character: GameCharacter): boolean {
    return (
        character.controllerKind !== 'network_player' &&
        character.soul.controlSource !== 'human' &&
        character.trainingTarget === undefined &&
        character.alive &&
        !character.tags.has('offline') &&
        !character.tags.has('state.retired')
    )
}
