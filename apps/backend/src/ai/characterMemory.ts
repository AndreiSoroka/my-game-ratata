import { randomUUID } from 'node:crypto'

import {
    activeMemoryMessage,
    applyMemoryPersonUpdate,
    currentConversationPerson,
    knownMemoryMessage,
    knownMemoryPeople,
    memoryConversationMessage,
    memoryConversationPartner,
    memoryInvolves,
    type MemoryMovementAnchor,
    newMemoryPerson,
    observeMemoryPerson,
} from './characterMemoryPeople'
import type {
    DeepMemoryResult,
    MemoryMessage,
    PersonMemory,
    PersonMemoryUpdate,
} from './characterMemoryTypes'
export type {
    DeepMemoryResult,
    MemoryMessage,
    PersonMemoryUpdate,
} from './characterMemoryTypes'

/** An identity owns this store. Neither a speaker change nor temporary death resets it. */
export class CharacterMemory {
    public readonly conversationId = `mind:${randomUUID()}`
    private messages: MemoryMessage[] = []
    private readonly ids = new Set<string>()
    private readonly people = new Map<string, PersonMemory>()
    private bytes = 0
    private sequence = 0
    private archiveRevision = 0
    private readonly listeners = new Set<(entry: MemoryMessage) => void>()
    private readonly movementAnchors = new Map<string, MemoryMovementAnchor>()
    private readonly order = new Map<string, number>()
    public constructor(
        public readonly ownerId: string,
        private readonly maxBytes = 64 * 1024 * 1024
    ) {}

    public remember(message: MemoryMessage): void {
        if (knownMemoryMessage(message, this.ids, this.people)) {
            return
        }
        const entry = structuredClone(message)
        this.ids.add(entry.id)
        this.order.set(entry.id, ++this.sequence)
        this.messages.push(entry)
        this.bytes += Buffer.byteLength(JSON.stringify(entry))
        const others = new Set(
            [
                entry.senderId,
                entry.recipientId,
                entry.conversationPartnerId,
            ].filter(
                (id): id is string => id !== undefined && id !== this.ownerId
            )
        )
        for (const id of others) {
            const person =
                this.people.get(id) ??
                newMemoryPerson(
                    id,
                    id === entry.senderId ? entry.senderName : id,
                    0
                )
            if (id === entry.senderId) {
                person.name = entry.senderName
                person.lastStatement = {
                    text: entry.text.slice(0, 600),
                    sourceId: entry.id,
                    at: entry.at,
                }
                if (person.summary.length === 0) {
                    person.summary =
                        `[${entry.source}] ${entry.senderName}: ${entry.text}`.slice(
                            0,
                            2000
                        )
                    person.sourceMessageIds = [entry.id]
                }
            }
            person.lastAt = Math.max(person.lastAt, entry.at)
            this.people.set(id, person)
        }
        const partner = memoryConversationPartner(entry, this.ownerId)
        if (partner !== undefined) {
            this.recordConversation(partner, entry.at)
        }
        this.compact()
        for (const listener of this.listeners) {
            listener(entry)
        }
    }
    public observe(
        personId: string,
        name: string,
        position: { x: number; y: number },
        locationId: string,
        at: number
    ): void {
        observeMemoryPerson(
            this.people,
            this.movementAnchors,
            (entry) => this.remember(entry),
            personId,
            name,
            position,
            locationId,
            at
        )
    }
    public get retirementRevision(): number {
        return this.archiveRevision
    }
    public archivePerson(personId: string, at: number): boolean {
        const person = this.people.get(personId)
        if (person === undefined || person.status === 'archived') {
            return false
        }
        person.status = 'archived'
        person.retiredAt = at
        this.movementAnchors.delete(personId)
        this.archiveRevision += 1
        return true
    }
    public isArchived(personId: string): boolean {
        return this.people.get(personId)?.status === 'archived'
    }
    public lastConversationAt(personId: string): number | undefined {
        return this.people.get(personId)?.lastConversationAt
    }
    public recordConversation(personId: string, at: number): void {
        const person = this.people.get(personId)
        if (person !== undefined && person.status !== 'archived') {
            person.lastConversationAt = Math.max(
                person.lastConversationAt ?? -Infinity,
                at
            )
        }
    }
    public recordAddressedSpeech(
        messageId: string,
        personId: string,
        at: number
    ): void {
        const entry = this.messages.find((message) => message.id === messageId)
        if (entry?.source === 'heard' && entry.senderId === personId) {
            this.bytes -= Buffer.byteLength(JSON.stringify(entry))
            entry.conversationPartnerId = this.ownerId
            this.bytes += Buffer.byteLength(JSON.stringify(entry))
            this.recordConversation(personId, at)
        }
    }
    public updatePerson(
        update: PersonMemoryUpdate,
        currentPersonId: string
    ): boolean {
        return applyMemoryPersonUpdate(
            this.people,
            this.messages,
            this.order,
            update,
            currentPersonId
        )
    }
    public context(personId: string | undefined, query: string) {
        const person =
            personId === undefined ? undefined : this.people.get(personId)
        return {
            conversationId: this.conversationId,
            ownerId: this.ownerId,
            person: currentConversationPerson(person),
            knownPeople: knownMemoryPeople(this.people, personId, query),
            recent: this.activeEntries()
                .filter(
                    (entry) =>
                        entry.source !== 'seen' &&
                        (personId === undefined ||
                            memoryConversationMessage(
                                entry,
                                this.ownerId,
                                personId
                            ))
                )
                .slice(-20)
                .map((entry) => ({ ...entry, text: entry.text.slice(0, 600) })),
            relevant: this.search(query, 6, undefined, true),
        }
    }
    public deep(personId: string, query = ''): DeepMemoryResult {
        const person = this.people.get(personId)
        if (person === undefined) {
            return { personId, status: 'not_known' }
        }
        const entries = this.messages.filter((entry) =>
            memoryInvolves(entry, personId)
        )
        const chosen = [
            ...entries.slice(-12),
            ...this.search(query, 8, personId),
        ]
        const unique = new Map(chosen.map((entry) => [entry.id, entry]))
        const messages = [...unique.values()]
            .sort((a, b) => a.at - b.at)
            .map((entry) => ({ ...entry, text: entry.text.slice(0, 600) }))
        while (Buffer.byteLength(JSON.stringify(messages)) > 10 * 1024) {
            messages.shift()
        }
        return {
            personId,
            status: 'found',
            identityStatus: person.status ?? 'active',
            summary: person.summary,
            messages,
            sourceMessageIds: [...person.sourceMessageIds],
            compacted: person.compacted,
            hasMore: entries.length > messages.length,
        }
    }
    public subscribe(listener: (entry: MemoryMessage) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }
    public entries(): readonly MemoryMessage[] {
        return this.messages
    }
    public activeEntries(): readonly MemoryMessage[] {
        return this.messages.filter((entry) =>
            activeMemoryMessage(entry, this.people)
        )
    }
    private search(
        query: string,
        limit: number,
        personId?: string,
        activeOnly = false
    ): MemoryMessage[] {
        const tokens =
            query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
        return (activeOnly ? this.activeEntries() : this.messages)
            .filter(
                (entry) =>
                    personId === undefined || memoryInvolves(entry, personId)
            )
            .map((entry) => ({
                entry,
                score: tokens.reduce(
                    (sum, token) =>
                        sum +
                        Number(entry.text.toLocaleLowerCase().includes(token)),
                    0
                ),
            }))
            .filter(({ score }) => score > 0)
            .sort((a, b) =>
                b.score !== a.score
                    ? b.score - a.score
                    : b.entry.at - a.entry.at
            )
            .slice(0, limit)
            .map(({ entry }) => ({ ...entry, text: entry.text.slice(0, 600) }))
    }
    private compact(): void {
        while (this.bytes > this.maxBytes && this.messages.length > 1) {
            const oldest = this.messages.shift()
            if (oldest === undefined) {
                break
            }
            this.bytes -= Buffer.byteLength(JSON.stringify(oldest))
            this.ids.delete(oldest.id)
            this.order.delete(oldest.id)
            for (const person of this.people.values()) {
                if (!memoryInvolves(oldest, person.id)) {
                    continue
                }
                person.compacted = true
                const quote = `[${oldest.id}; ${String(oldest.at)}; ${oldest.source}] ${oldest.senderName}: ${oldest.text}`
                person.summary = `${person.summary}\n${quote}`.slice(-2000)
                person.sourceMessageIds = [
                    ...new Set([...person.sourceMessageIds, oldest.id]),
                ].slice(-40)
            }
        }
    }
}
