import type { CharacterSnapshot, GameEventPayload, WorldSnapshot } from '@my-game-ratata/contracts'

import { relation } from '../ui/combatTargeting'
import { removedActor } from './castAudioEvents'

const battleHoldMs = 8000
const visibilityMaxAgeMs = 1000
const combatEvents = new Set<GameEventPayload['kind']>([
    'attack',
    'damage',
    'miss',
    'parry',
    'absorb',
])

interface BattleObservation {
    characters: readonly CharacterSnapshot[]
    hostileIds: readonly string[]
    locationId: string
    listenerId: string
    forest: boolean
    listenerAlive: boolean
    serverTime: number
    receivedAt: number
}

interface Contact {
    at: number
    ended?: true
}

/** Holds a forest encounter across brief gaps in combat and changes in local terrain. */
export class BattleMusicState {
    private observation: BattleObservation | undefined
    private readonly opponents = new Map<string | null, Contact>()
    private latestServerTime = -Infinity
    private clockOffset = -Infinity
    private listenerEndedAt = -Infinity
    private holdUntil = -Infinity

    public constructor(private readonly now: () => number = () => performance.now()) {}

    public update(isVisible?: (id: string) => boolean, hasBattleTrack = false): boolean {
        const observation = this.observation
        const now = this.now()
        const serverTime = now + this.clockOffset
        if (!observation?.listenerAlive || !this.canContinue(serverTime, hasBattleTrack)) {
            this.holdUntil = -Infinity
            return false
        }
        if (isVisible && this.hasVisibleEnemy(observation, now, isVisible)) {
            this.extendHold(observation.serverTime)
        }
        return serverTime < this.holdUntil
    }

    private hasVisibleEnemy(
        observation: BattleObservation,
        now: number,
        isVisible: (id: string) => boolean
    ): boolean {
        return (
            now - observation.receivedAt <= visibilityMaxAgeMs &&
            observation.hostileIds.some((id) => !this.opponents.get(id)?.ended && isVisible(id))
        )
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
        const listenerAvailable = available(listener)
        const listenerAlive = listenerAvailable && serverTime > this.listenerEndedAt
        if (!listenerAvailable) this.listenerEndedAt = serverTime
        if (!listenerAlive) {
            this.opponents.clear()
            this.holdUntil = -Infinity
        }
        this.observation = {
            characters: snapshot.characters,
            hostileIds: hostileIds(snapshot.characters, listenerAlive ? listener : undefined),
            locationId: location.id,
            listenerId,
            forest,
            listenerAlive,
            serverTime,
            receivedAt: this.now(),
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

    public receive(event: GameEventPayload, serverTime: number, hasBattleTrack = false): void {
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
        if (
            opponent === undefined ||
            !this.acceptsCombat(observation, opponent, serverTime, hasBattleTrack)
        )
            return
        this.advanceClock(serverTime)
        this.opponents.set(opponent, { at: serverTime })
        this.extendHold(serverTime)
    }

    private acceptsCombat(
        observation: BattleObservation,
        opponent: string | null,
        serverTime: number,
        hasBattleTrack: boolean
    ): boolean {
        if (this.opponents.get(opponent)?.ended) return false
        const known = observation.characters.find((character) => character.id === opponent)
        if (known && !available(known)) return false
        const estimatedTime = Math.max(serverTime, this.now() + this.clockOffset)
        return observation.forest || this.canContinue(estimatedTime, hasBattleTrack)
    }

    private removeOpponent(
        observation: BattleObservation,
        removed: string,
        serverTime: number
    ): void {
        if (removed === observation.listenerId) {
            this.advanceClock(serverTime)
            this.opponents.clear()
            this.holdUntil = -Infinity
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
        this.holdUntil = -Infinity
    }

    private canContinue(serverTime: number, hasBattleTrack: boolean): boolean {
        return serverTime < this.holdUntil || (this.holdUntil !== -Infinity && hasBattleTrack)
    }

    private extendHold(serverTime: number): void {
        this.holdUntil = Math.max(this.holdUntil, serverTime + battleHoldMs)
    }

    private isCurrentTime(serverTime: number): boolean {
        return Number.isFinite(serverTime) && serverTime >= this.latestServerTime
    }

    private advanceClock(serverTime: number): void {
        const now = this.now()
        this.latestServerTime = serverTime
        this.clockOffset = Math.max(this.clockOffset, serverTime - now)
        for (const [opponent, contact] of this.opponents) {
            if (now + this.clockOffset >= contact.at + battleHoldMs) this.opponents.delete(opponent)
        }
    }
}

function hostileIds(
    characters: readonly CharacterSnapshot[],
    listener: CharacterSnapshot | undefined
): string[] {
    if (!listener) return []
    return characters.flatMap((character) =>
        available(character) && relation(character, listener) === 'hostile' ? [character.id] : []
    )
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
