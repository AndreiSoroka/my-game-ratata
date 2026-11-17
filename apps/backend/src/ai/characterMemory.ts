import { randomUUID } from 'node:crypto'

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
    private readonly listeners = new Set<(entry: MemoryMessage) => void>()
    private readonly movementAnchors = new Map<
        string,
        { x: number; y: number; at: number; locationId: string }
    >()
    private readonly order = new Map<string, number>()
    public constructor(
        public readonly ownerId: string,
        private readonly maxBytes = 64 * 1024 * 1024
    ) {}

    public remember(message: MemoryMessage): void {
        if (this.knownMessage(message)) {
            return
        }
        const entry = structuredClone(message)
        this.ids.add(entry.id)
        this.order.set(entry.id, ++this.sequence)
        this.messages.push(entry)
        this.bytes += Buffer.byteLength(JSON.stringify(entry))
        const others = [entry.senderId, entry.recipientId].filter(
            (id): id is string => id !== undefined && id !== this.ownerId
        )
        for (const id of others) {
            const person = this.people.get(id) ?? {
                id,
                name: id === entry.senderId ? entry.senderName : id,
                summary: '',
                sourceMessageIds: [],
                through: 0,
                lastAt: 0,
                compacted: false,
            }
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
        const person = this.people.get(personId) ?? {
            id: personId,
            name,
            summary: '',
            sourceMessageIds: [],
            through: 0,
            lastAt: at,
            compacted: false,
        }
        const latest = person.lastSeen
        const previous = this.movementAnchors.get(personId)
        person.lastSeen = { at, locationId, position: { ...position } }
        this.people.set(personId, person)
        if (
            previous?.locationId !== locationId ||
            latest === undefined ||
            at - latest.at > 2000
        ) {
            this.movementAnchors.set(personId, { ...position, at, locationId })
            return
        }
        if (Math.hypot(position.x - previous.x, position.y - previous.y) < 16) {
            return
        }
        this.movementAnchors.set(personId, { ...position, at, locationId })
        const dx = position.x - previous.x,
            dy = position.y - previous.y
        const direction =
            Math.abs(dx) > Math.abs(dy)
                ? dx < 0
                    ? 'к западу'
                    : 'к востоку'
                : dy < 0
                  ? 'к северу'
                  : 'к югу'
        this.remember({
            id: `seen:${personId}:${String(at)}`,
            senderId: personId,
            senderName: name,
            text: `Наблюдала: ${name} двигался ${direction}. Это последнее наблюдение, не его текущее скрытое положение.`,
            channel: 'say',
            source: 'seen',
            at,
            locationId,
        })
    }
    public updatePerson(
        update: PersonMemoryUpdate,
        currentPersonId: string
    ): boolean {
        const person = this.people.get(currentPersonId)
        const watermark = this.order.get(update.throughMessageId)
        if (
            person === undefined ||
            update.personId !== currentPersonId ||
            watermark === undefined ||
            watermark <= person.through ||
            update.text.trim().length === 0 ||
            update.text.length > 2000 ||
            update.sourceMessageIds.length === 0 ||
            update.sourceMessageIds.length > 40
        ) {
            return false
        }
        const through = this.messages.find(
            (entry) => entry.id === update.throughMessageId
        )
        if (through === undefined || !this.involves(through, currentPersonId)) {
            return false
        }
        if (
            !update.sourceMessageIds.every((id) => {
                const message = this.messages.find((entry) => entry.id === id)
                return (
                    message !== undefined &&
                    (this.order.get(id) ?? Infinity) <= watermark &&
                    this.involves(message, currentPersonId)
                )
            })
        ) {
            return false
        }
        person.summary = update.text.trim()
        person.sourceMessageIds = [...new Set(update.sourceMessageIds)]
        person.through = watermark
        return true
    }
    public context(personId: string | undefined, query: string) {
        const person =
            personId === undefined ? undefined : this.people.get(personId)
        const mentioned = [...this.people.values()].filter(
            (entry) =>
                entry.id === personId ||
                query
                    .toLocaleLowerCase()
                    .includes(entry.name.toLocaleLowerCase())
        )
        return {
            conversationId: this.conversationId,
            ownerId: this.ownerId,
            person: person === undefined ? null : structuredClone(person),
            knownPeople: mentioned
                .slice(0, 8)
                .map(({ id, name, lastAt }) => ({ id, name, lastAt })),
            recent: this.messages
                .filter((entry) => entry.source !== 'seen')
                .slice(-20)
                .map((entry) => ({ ...entry, text: entry.text.slice(0, 600) })),
            relevant: this.search(query, 6),
        }
    }
    public deep(personId: string, query = ''): DeepMemoryResult {
        const person = this.people.get(personId)
        if (person === undefined) {
            return { personId, status: 'not_known' }
        }
        const entries = this.messages.filter((entry) =>
            this.involves(entry, personId)
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
    private knownMessage(message: MemoryMessage): boolean {
        return (
            this.ids.has(message.id) ||
            (this.people
                .get(message.senderId)
                ?.sourceMessageIds.includes(message.id) ??
                false)
        )
    }
    public entries(): readonly MemoryMessage[] {
        return this.messages
    }
    private involves(message: MemoryMessage, personId: string): boolean {
        return message.senderId === personId || message.recipientId === personId
    }
    private search(
        query: string,
        limit: number,
        personId?: string
    ): MemoryMessage[] {
        const tokens =
            query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
        return this.messages
            .filter(
                (entry) =>
                    personId === undefined || this.involves(entry, personId)
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
                if (!this.involves(oldest, person.id)) {
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
