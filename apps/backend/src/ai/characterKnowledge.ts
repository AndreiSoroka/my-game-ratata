import type { GameCharacter } from '../game/character'
import type { NavigationService } from '../game/navigation'
import type { CharacterMemory } from './characterMemory'
import {
    characterKnowledge,
    type KnowledgeEntry,
    landmarkText,
} from './knowledgeCatalog'
import {
    type EmbeddingProvider,
    LocalEmbeddings,
    SemanticIndex,
} from './localEmbeddings'
export type { KnowledgeEntry } from './knowledgeCatalog'
export { characterKnowledge } from './knowledgeCatalog'

export interface KnowledgeResult {
    groups: string[]
    entries: KnowledgeEntry[]
    memories: Array<{
        id: string
        text: string
        source: string
        at: number
        senderId: string
    }>
}

function lexical(query: string, text: string): number {
    const normalized = text.toLocaleLowerCase()
    return (query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).reduce(
        (sum, token) => sum + Number(normalized.includes(token)),
        0
    )
}
export class CharacterKnowledge {
    private readonly index: SemanticIndex
    private readonly tracked = new WeakSet<CharacterMemory>()
    private readonly subscriptions: Array<() => void> = []
    private stopped = false
    public constructor(
        provider: EmbeddingProvider = new LocalEmbeddings(),
        diagnostic: (message: string) => void = reportKnowledgeDiagnostic
    ) {
        this.index = new SemanticIndex(provider, diagnostic)
    }
    public async retrieve(
        actor: GameCharacter,
        navigation: NavigationService,
        memory: CharacterMemory,
        query: string
    ): Promise<KnowledgeResult> {
        this.track(memory)
        const entries = characterKnowledge(actor, navigation)
        const recent = memory.entries().slice(-128)
        for (const entry of entries) {
            this.index.remember(entry.id, entry.text)
        }
        for (const entry of recent) {
            this.index.remember(
                `memory:${memory.conversationId}:${entry.id}`,
                entry.text
            )
        }
        const keys = [
            ...entries.map((entry) => entry.id),
            ...recent.map(
                (entry) => `memory:${memory.conversationId}:${entry.id}`
            ),
        ]
        const scores =
            query.trim().length > 0
                ? await this.index.rank(query, keys)
                : new Map<string, number>()
        // Reproject after asynchronous retrieval: progression/identity can have changed.
        const stillAllowed = new Set(
            characterKnowledge(actor, navigation).map((entry) => entry.id)
        )
        const ranked = entries
            .filter((entry) => stillAllowed.has(entry.id))
            .map((entry) => ({
                entry,
                score: lexical(query, entry.text) + (scores.get(entry.id) ?? 0),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .map(({ entry }) => ({
                ...entry,
                text: landmarkText(entry, actor, navigation).slice(0, 800),
            }))
        const memories = recent
            .map((entry) => ({
                entry,
                score:
                    lexical(query, entry.text) +
                    (scores.get(
                        `memory:${memory.conversationId}:${entry.id}`
                    ) ?? 0),
            }))
            .filter(({ score }) => score > 0)
            .sort((a, b) =>
                b.score !== a.score
                    ? b.score - a.score
                    : b.entry.at - a.entry.at
            )
            .slice(0, 6)
            .map(({ entry }) => ({
                id: entry.id,
                text: entry.text.slice(0, 600),
                source: entry.source,
                at: entry.at,
                senderId: entry.senderId,
            }))
        return {
            groups: [...new Set(ranked.map((entry) => entry.group))],
            entries: ranked,
            memories,
        }
    }
    public async deep(
        memory: CharacterMemory,
        personId: string,
        query: string
    ) {
        this.track(memory)
        const result = memory.deep(personId, query)
        if (result.status === 'not_known') {
            return result
        }
        const entries = memory
            .entries()
            .filter(
                (entry) =>
                    entry.senderId === personId ||
                    entry.recipientId === personId
            )
        for (const entry of entries.slice(-128)) {
            this.index.remember(
                `memory:${memory.conversationId}:${entry.id}`,
                entry.text
            )
        }
        const scores = await this.index.rank(
            query,
            entries.map(
                (entry) => `memory:${memory.conversationId}:${entry.id}`
            )
        )
        const relevant = entries
            .map((entry) => ({
                entry,
                score:
                    lexical(query, entry.text) +
                    (scores.get(
                        `memory:${memory.conversationId}:${entry.id}`
                    ) ?? 0),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
            .map(({ entry }) => ({ ...entry, text: entry.text.slice(0, 600) }))
        const messages = [
            ...new Map(
                [...(result.messages ?? []), ...relevant].map((entry) => [
                    entry.id,
                    entry,
                ])
            ).values(),
        ].sort((a, b) => a.at - b.at)
        while (Buffer.byteLength(JSON.stringify(messages)) > 10 * 1024) {
            messages.shift()
        }
        return { ...result, messages }
    }
    private track(memory: CharacterMemory): void {
        const prefix = `memory:${memory.conversationId}:`
        this.index.forgetExcept(
            prefix,
            new Set(memory.entries().map((entry) => `${prefix}${entry.id}`))
        )
        if (this.tracked.has(memory)) {
            return
        }
        this.tracked.add(memory)
        this.subscriptions.push(
            memory.subscribe((entry) =>
                this.index.remember(`${prefix}${entry.id}`, entry.text)
            )
        )
        void this.indexArchive(memory, prefix)
    }
    private async indexArchive(
        memory: CharacterMemory,
        prefix: string
    ): Promise<void> {
        const entries = memory.entries()
        for (
            let offset = 0;
            offset < entries.length && !this.stopped;
            offset += 64
        ) {
            for (const entry of entries.slice(offset, offset + 64)) {
                this.index.remember(`${prefix}${entry.id}`, entry.text)
            }
            await this.index.idle()
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
        }
    }
    public stop(): void {
        this.stopped = true
        for (const unsubscribe of this.subscriptions) {
            unsubscribe()
        }
        this.subscriptions.length = 0
        this.index.stop()
    }
}

const reportedKnowledgeDiagnostics = new Set<string>()
function reportKnowledgeDiagnostic(message: string): void {
    if (
        process.env['VITEST'] === 'true' ||
        reportedKnowledgeDiagnostics.has(message)
    ) {
        return
    }
    reportedKnowledgeDiagnostics.add(message)
    console.warn('NPC retrieval:', message)
}
