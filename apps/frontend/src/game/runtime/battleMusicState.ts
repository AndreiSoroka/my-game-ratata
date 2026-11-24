import type { CharacterSnapshot, GameEventPayload, WorldSnapshot } from '@my-game-ratata/contracts'

import { removedActor } from './castAudioEvents'

const battleIdleMs = 5000
const combatEvents = new Set<GameEventPayload['kind']>([
    'attack',
    'damage',
    'miss',
    'parry',
    'absorb',
])

interface BattleObservation {
    characters: readonly CharacterSnapshot[]
    locationId: string
    listenerId: string
    forest: boolean
    listenerAlive: boolean
}

interface Contact {
    at: number
    ended?: true
}

/** Tracks recent, server-confirmed combat involving the listener on the applied map. */
export class BattleMusicState {
    private observation: BattleObservation | undefined
    private readonly opponents = new Map<string | null, Contact>()
    private latestServerTime = -Infinity
    private clockOffset = -Infinity
    private listenerEndedAt = -Infinity

    public constructor(private readonly now: () => number = () => performance.now()) {}

    public get active(): boolean {
        if (!this.observation?.forest || !this.observation.listenerAlive) return false
        const serverTime = this.now() + this.clockOffset
        for (const contact of this.opponents.values()) {
            if (!contact.ended && serverTime < contact.at + battleIdleMs) return true
        }
        return false
    }

    public observe(snapshot: WorldSnapshot, listenerId: string, forest: boolean): void {
        const { location, serverTime } = snapshot
        if (!this.isCurrentTime(serverTime)) return
        const previous = this.observation
        if (location?.id !== previous?.locationId || previous?.listenerId !== listenerId)
            this.clear()
        this.advanceClock(serverTime)
        if (!location) return

        const listener = snapshot.characters.find((character) => character.id === listenerId)
        const listenerAlive = available(listener)
        if (!listenerAlive) {
            this.listenerEndedAt = serverTime
            this.opponents.clear()
        }
        this.observation = {
            characters: snapshot.characters,
            locationId: location.id,
            listenerId,
            forest,
            listenerAlive: listenerAlive && serverTime > this.listenerEndedAt,
        }
        this.observeOpponents(snapshot.characters, serverTime)
    }

    private observeOpponents(characters: readonly CharacterSnapshot[], serverTime: number): void {
        for (const character of characters) {
            const contact = this.opponents.get(character.id)
            if (!contact) continue
            if (!available(character))
                this.opponents.set(character.id, { at: serverTime, ended: true })
            else if (contact.ended && serverTime > contact.at) this.opponents.delete(character.id)
        }
    }

    public receive(event: GameEventPayload, serverTime: number): void {
        const observation = this.observation
        if (
            !observation?.listenerAlive ||
            !this.isCurrentTime(serverTime) ||
            (event.locationId !== undefined && event.locationId !== observation.locationId)
        )
            return

        const removed = removedActor(event)
        if (removed !== undefined) {
            this.removeOpponent(observation, removed, serverTime)
            return
        }

        const opponent = opponentIn(event, observation.listenerId)
        if (opponent === undefined || this.opponents.get(opponent)?.ended) return
        const known = observation.characters.find((character) => character.id === opponent)
        if (known && !available(known)) return
        this.advanceClock(serverTime)
        this.opponents.set(opponent, { at: serverTime })
    }

    private removeOpponent(
        observation: BattleObservation,
        removed: string,
        serverTime: number
    ): void {
        if (removed === observation.listenerId) {
            this.advanceClock(serverTime)
            this.opponents.clear()
            this.listenerEndedAt = serverTime
            observation.listenerAlive = false
            return
        }
        if (
            !this.opponents.has(removed) &&
            !observation.characters.some((character) => character.id === removed)
        )
            return
        this.advanceClock(serverTime)
        this.opponents.set(removed, { at: serverTime, ended: true })
    }

    public clear(): void {
        this.observation = undefined
        this.opponents.clear()
        this.latestServerTime = -Infinity
        this.clockOffset = -Infinity
        this.listenerEndedAt = -Infinity
    }

    private isCurrentTime(serverTime: number): boolean {
        return Number.isFinite(serverTime) && serverTime >= this.latestServerTime
    }

    private advanceClock(serverTime: number): void {
        const now = this.now()
        this.latestServerTime = serverTime
        this.clockOffset = Math.max(this.clockOffset, serverTime - now)
        for (const [opponent, contact] of this.opponents) {
            if (now + this.clockOffset >= contact.at + battleIdleMs) this.opponents.delete(opponent)
        }
    }
}

function available(character: CharacterSnapshot | undefined): boolean {
    return (
        character?.alive === true &&
        character.trainingTarget === undefined &&
        !character.tags.includes('offline') &&
        !character.tags.includes('state.retired')
    )
}

function opponentIn(event: GameEventPayload, listenerId: string): string | null | undefined {
    const { actorId, targetId, kind } = event
    if (!combatEvents.has(kind) || event.phase === 'interrupted' || actorId === targetId)
        return undefined
    if (actorId === listenerId) return targetId
    if (targetId !== listenerId) return undefined
    // Incoming damage still belongs to the listener when the server redacts an unseen attacker.
    return actorId ?? (kind === 'damage' ? null : undefined)
}
