import type {
    MemoryMessage,
    PersonMemory,
    PersonMemoryUpdate,
} from './characterMemoryTypes'

export function memoryInvolves(
    message: MemoryMessage,
    personId: string
): boolean {
    return (
        message.senderId === personId ||
        message.recipientId === personId ||
        message.conversationPartnerId === personId
    )
}

export function activeMemoryMessage(
    entry: MemoryMessage,
    people: ReadonlyMap<string, PersonMemory>
): boolean {
    return ![
        entry.senderId,
        entry.recipientId,
        entry.conversationPartnerId,
    ].some((id) => id !== undefined && people.get(id)?.status === 'archived')
}

export function knownMemoryPeople(
    people: ReadonlyMap<string, PersonMemory>,
    personId: string | undefined,
    query: string
): Array<{
    id: string
    name: string
    lastAt: number
    status: 'active' | 'archived'
}> {
    const currentName =
        personId === undefined
            ? undefined
            : people.get(personId)?.name.normalize('NFKC').toLocaleLowerCase()
    const normalizedQuery = query.normalize('NFKC').toLocaleLowerCase()
    return [...people.values()]
        .filter((entry) => {
            const name = entry.name.normalize('NFKC').toLocaleLowerCase()
            return (
                entry.id === personId ||
                normalizedQuery.includes(name) ||
                (entry.status === 'archived' &&
                    currentName !== undefined &&
                    name === currentName)
            )
        })
        .sort((a, b) => {
            const currentFirst =
                Number(b.id === personId) - Number(a.id === personId)
            return currentFirst === 0 ? b.lastAt - a.lastAt : currentFirst
        })
        .slice(0, 8)
        .map(({ id, name, lastAt, status }) => ({
            id,
            name,
            lastAt,
            status: status ?? 'active',
        }))
}

export function memoryConversationMessage(
    entry: MemoryMessage,
    ownerId: string,
    personId: string
): boolean {
    const addressedTo =
        entry.channel === 'whisper'
            ? entry.recipientId
            : entry.conversationPartnerId
    return (
        (entry.senderId === ownerId && addressedTo === personId) ||
        (entry.senderId === personId && addressedTo === ownerId)
    )
}

export function currentConversationPerson(
    person: PersonMemory | undefined
): PersonMemory | null {
    if (person === undefined) {
        return null
    }
    const current = structuredClone(person)
    if (current.lastConversationAt === undefined) {
        current.summary = ''
        current.sourceMessageIds = []
    }
    return current
}

export function knownMemoryMessage(
    message: MemoryMessage,
    ids: ReadonlySet<string>,
    people: ReadonlyMap<string, PersonMemory>
): boolean {
    return (
        ids.has(message.id) ||
        (people.get(message.senderId)?.sourceMessageIds.includes(message.id) ??
            false)
    )
}

export function memoryConversationPartner(
    entry: MemoryMessage,
    ownerId: string
): string | undefined {
    if (entry.source !== 'heard') {
        return undefined
    }
    const addressedTo =
        entry.channel === 'whisper'
            ? entry.recipientId
            : entry.conversationPartnerId
    return entry.senderId === ownerId
        ? addressedTo
        : addressedTo === ownerId
          ? entry.senderId
          : undefined
}

export function applyMemoryPersonUpdate(
    people: Map<string, PersonMemory>,
    messages: readonly MemoryMessage[],
    order: ReadonlyMap<string, number>,
    update: PersonMemoryUpdate,
    currentPersonId: string
): boolean {
    const person = people.get(currentPersonId)
    const watermark = order.get(update.throughMessageId)
    if (
        person === undefined ||
        person.status === 'archived' ||
        watermark === undefined
    ) {
        return false
    }
    if (!validPersonUpdate(person, update, currentPersonId, watermark)) {
        return false
    }
    const through = messages.find(
        (entry) => entry.id === update.throughMessageId
    )
    if (through === undefined || !memoryInvolves(through, currentPersonId)) {
        return false
    }
    if (
        !update.sourceMessageIds.every((id) => {
            const message = messages.find((entry) => entry.id === id)
            return (
                message !== undefined &&
                (order.get(id) ?? Infinity) <= watermark &&
                memoryInvolves(message, currentPersonId)
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

function validPersonUpdate(
    person: PersonMemory,
    update: PersonMemoryUpdate,
    personId: string,
    watermark: number
): boolean {
    return (
        update.personId === personId &&
        watermark > person.through &&
        update.text.trim().length > 0 &&
        update.text.length <= 2000 &&
        update.sourceMessageIds.length > 0 &&
        update.sourceMessageIds.length <= 40
    )
}

export interface MemoryMovementAnchor {
    x: number
    y: number
    at: number
    locationId: string
}

export function newMemoryPerson(
    id: string,
    name: string,
    at: number
): PersonMemory {
    return {
        id,
        name,
        summary: '',
        sourceMessageIds: [],
        through: 0,
        lastAt: at,
        compacted: false,
        status: 'active',
    }
}

export function observeMemoryPerson(
    people: Map<string, PersonMemory>,
    anchors: Map<string, MemoryMovementAnchor>,
    remember: (message: MemoryMessage) => void,
    personId: string,
    name: string,
    position: { x: number; y: number },
    locationId: string,
    at: number
): void {
    const person = people.get(personId) ?? newMemoryPerson(personId, name, at)
    if (person.status === 'archived') {
        return
    }
    const latest = person.lastSeen
    const previous = anchors.get(personId)
    person.lastSeen = { at, locationId, position: { ...position } }
    people.set(personId, person)
    if (
        previous?.locationId !== locationId ||
        latest === undefined ||
        at - latest.at > 2000
    ) {
        anchors.set(personId, { ...position, at, locationId })
        return
    }
    if (Math.hypot(position.x - previous.x, position.y - previous.y) < 16) {
        return
    }
    anchors.set(personId, { ...position, at, locationId })
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
    remember({
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
