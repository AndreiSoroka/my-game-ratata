import type { GameCharacter } from '../game/character'
import type { NavigationService } from '../game/navigation'
import type { CharacterMemory } from './characterMemory'
import { characterKnowledge, type KnowledgeEntry } from './knowledgeCatalog'
import {
    type KnowledgePassage,
    knowledgeSearchText,
    lexicalKnowledgeScore as lexical,
    selectKnowledgePassages,
} from './knowledgeSelection'
import {
    type EmbeddingProvider,
    LocalEmbeddings,
    SemanticIndex,
} from './localEmbeddings'
export type { KnowledgeEntry } from './knowledgeCatalog'
export { characterKnowledge } from './knowledgeCatalog'
export type { KnowledgePassage } from './knowledgeSelection'

export interface KnowledgeResult {
    groups: string[]
    entries: KnowledgePassage[]
    memories: Array<{
        id: string
        text: string
        source: string
        at: number
        senderId: string
    }>
}

type KnowledgeCatalog = (
    actor: GameCharacter,
    navigation: NavigationService
) => readonly KnowledgeEntry[]

export class CharacterKnowledge {
    private readonly index: SemanticIndex
    private readonly tracked = new WeakSet<CharacterMemory>()
    private readonly subscriptions: Array<() => void> = []
    private stopped = false
    public constructor(
        provider: EmbeddingProvider = new LocalEmbeddings(),
        diagnostic: (message: string) => void = reportKnowledgeDiagnostic,
        private readonly catalog: KnowledgeCatalog = characterKnowledge
    ) {
        this.index = new SemanticIndex(provider, diagnostic)
    }
    public async retrieve(
        actor: GameCharacter,
        navigation: NavigationService,
        memory: CharacterMemory,
        query: string
    ): Promise<KnowledgeResult> {
        if (this.isStopped() || query.trim().length === 0) {
            return { groups: [], entries: [], memories: [] }
        }
        this.track(memory)
        const entries = this.catalog(actor, navigation)
        const recent = memory.activeEntries().slice(-128)
        for (const entry of entries) {
            this.index.remember(
                entry.id,
                knowledgeSearchText(entry),
                entry.source.startsWith('authored:')
            )
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
        const scores = await this.index.rank(query, keys)
        if (this.isStopped()) {
            return { groups: [], entries: [], memories: [] }
        }
        // Reproject after asynchronous retrieval: progression/identity can have changed.
        const selected = selectKnowledgePassages({
            initial: entries,
            current: this.catalog(actor, navigation),
            scores,
            query,
            actor,
            navigation,
        })
        const currentMemories = new Map(
            memory.activeEntries().map((entry) => [entry.id, entry.text])
        )
        const memories = recent
            .filter((entry) => currentMemories.get(entry.id) === entry.text)
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
            groups: [...new Set(selected.map((entry) => entry.group))],
            entries: selected,
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
        const currentEntries = new Map(
            memory.entries().map((entry) => [entry.id, entry.text])
        )
        const fresh = memory.deep(personId, query)
        if (fresh.status === 'not_known') {
            return fresh
        }
        const relevant = entries
            .filter((entry) => currentEntries.get(entry.id) === entry.text)
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
                [...(fresh.messages ?? []), ...relevant].map((entry) => [
                    entry.id,
                    entry,
                ])
            ).values(),
        ].sort((a, b) => a.at - b.at)
        while (Buffer.byteLength(JSON.stringify(messages)) > 10 * 1024) {
            messages.shift()
        }
        return { ...fresh, messages }
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
    private isStopped(): boolean {
        return this.stopped
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
