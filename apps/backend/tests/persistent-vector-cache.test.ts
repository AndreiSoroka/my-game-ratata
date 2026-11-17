import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers'

import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import modelProfile from '../../../scripts/knowledge-profile.json'
import {
    CharacterKnowledge,
    type KnowledgeEntry,
} from '../src/ai/characterKnowledge'
import { CharacterMemory } from '../src/ai/characterMemory'
import { embeddingCacheProfile } from '../src/ai/embeddingProfile'
import type { EmbeddingProvider } from '../src/ai/embeddingTypes'
import { PersistentVectorCache } from '../src/ai/persistentVectorCache'
import { SemanticIndex } from '../src/ai/semanticIndex'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'

const directories: string[] = []
const indexes: SemanticIndex[] = []
const profile = { fingerprint: 'test-model-a', dimensions: 2 }
const immediate = () => new Promise<void>((resolve) => setImmediate(resolve))

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(async () => {
    for (const index of indexes.splice(0)) {
        await index.idle()
        index.stop()
    }
    for (const directory of directories.splice(0)) {
        await rm(directory, { recursive: true, force: true })
    }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

async function path(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'ratata-vector-test-'))
    directories.push(directory)
    return join(directory, 'vectors.json')
}
function provider(cache?: PersistentVectorCache) {
    return {
        embed: vi.fn<EmbeddingProvider['embed']>((texts) =>
            Promise.resolve(texts.map(() => [1, 0]))
        ),
        ...(cache === undefined ? {} : { persistentCache: () => cache }),
    }
}
function index(
    fake: EmbeddingProvider,
    cache?: PersistentVectorCache
): SemanticIndex {
    const value = new SemanticIndex(fake, () => undefined, cache)
    indexes.push(value)
    return value
}
function passageCalls(fake: ReturnType<typeof provider>): string[] {
    return fake.embed.mock.calls
        .filter(([, query]) => query !== true)
        .flatMap(([texts]) => texts)
}

it('reuses persisted passages after restart while still embedding each query', async () => {
    const file = await path()
    const firstProvider = provider(new PersistentVectorCache(file, profile))
    const first = index(firstProvider)
    first.remember('wood', 'Древесина и топор', true)
    await first.idle()
    expect(passageCalls(firstProvider)).toEqual(['Древесина и топор'])
    const secondProvider = provider(new PersistentVectorCache(file, profile))
    const second = index(secondProvider)
    second.remember('different-id', 'Древесина и топор', true)
    const scores = await second.rank('топор', ['different-id'])
    expect(scores.get('different-id')).toBe(1)
    expect(passageCalls(secondProvider)).toEqual([])
    expect(secondProvider.embed).toHaveBeenCalledExactlyOnceWith(
        ['топор'],
        true
    )
})

it('recomputes only changed search text including aliases', async () => {
    const file = await path()
    const first = index(provider(), new PersistentVectorCache(file, profile))
    first.remember('a', 'Дерево\nрубка', true)
    first.remember('b', 'Камень\nкирка', true)
    await first.idle()
    const secondProvider = provider()
    const second = index(
        secondProvider,
        new PersistentVectorCache(file, profile)
    )
    second.remember('a', 'Дерево\nлесоповал', true)
    second.remember('b', 'Камень\nкирка', true)
    await second.idle()
    expect(passageCalls(secondProvider)).toEqual(['Дерево\nлесоповал'])
})

it('treats a different model profile as a cold cache', async () => {
    const file = await path()
    await new PersistentVectorCache(file, profile).put([['текст', [1, 0]]])
    const fresh = new PersistentVectorCache(file, {
        ...profile,
        fingerprint: 'test-model-b',
    })
    expect(await fresh.get('текст')).toBeUndefined()
    const fake = provider(fresh)
    index(fake).remember('text', 'текст', true)
    await indexes.at(-1)?.idle()
    expect(passageCalls(fake)).toEqual(['текст'])
})

it.each(['json', 'schema', 'profile', 'dimensions', 'vector'])(
    'discards invalid %s cache data and repairs it',
    async (kind) => {
        const file = await path()
        await new PersistentVectorCache(file, profile).put([['текст', [1, 0]]])
        const original = await readFile(file, 'utf8')
        const data = JSON.parse(original) as {
            schemaVersion: number
            profile: string
            dimensions: number
            vectors: Record<string, unknown>
        }
        if (kind === 'schema') {
            data.schemaVersion = 9
        }
        if (kind === 'profile') {
            data.profile = 'old-model'
        }
        if (kind === 'dimensions') {
            data.dimensions = 3
        }
        if (kind === 'vector') {
            const key = Object.keys(data.vectors)[0]
            if (key === undefined) {
                throw new Error('Missing fixture vector')
            }
            data.vectors[key] = [null, 0]
        }
        await writeFile(
            file,
            kind === 'json' ? '{broken' : JSON.stringify(data)
        )
        const diagnostic = vi.fn()
        const cache = new PersistentVectorCache(file, profile, diagnostic)
        expect(await cache.get('текст')).toBeUndefined()
        expect(diagnostic).toHaveBeenCalled()
        await cache.put([['текст', [1, 0]]])
        expect(
            await new PersistentVectorCache(file, profile).get('текст')
        ).toEqual([1, 0])
    }
)

it('keeps in-memory search working when the cache cannot be written', async () => {
    const file = await path()
    await writeFile(file, 'directory blocker')
    const diagnostic = vi.fn()
    const cache = new PersistentVectorCache(
        join(file, 'vectors.json'),
        profile,
        diagnostic
    )
    const fake = provider(cache)
    const search = index(fake)
    search.remember('wood', 'древесина', true)
    expect((await search.rank('дерево', ['wood'])).get('wood')).toBe(1)
    expect(diagnostic).toHaveBeenCalled()
    expect(await cache.get('древесина')).toEqual([1, 0])
})

it('merges concurrent cache writers without losing entries or exposing temporary files', async () => {
    const file = await path()
    const options = { attempts: 500, wait: immediate }
    const caches = Array.from(
        { length: 4 },
        () => new PersistentVectorCache(file, profile, () => undefined, options)
    )
    await Promise.all(
        caches.map((cache, number) =>
            cache.put([[`текст-${String(number)}`, [1, 0]]])
        )
    )
    const reopened = new PersistentVectorCache(file, profile)
    for (let number = 0; number < caches.length; number++) {
        expect(await reopened.get(`текст-${String(number)}`)).toEqual([1, 0])
    }
    const data: unknown = JSON.parse(await readFile(file, 'utf8'))
    expect(data).toHaveProperty('schemaVersion', 1)
})

it('does not save a superseded in-flight passage or serve its vector', async () => {
    let complete: ((vectors: number[][]) => void) | undefined
    let started: (() => void) | undefined
    const waiting = new Promise<void>((resolve) => {
        started = resolve
    })
    let calls = 0
    const fake: EmbeddingProvider = {
        embed(texts, query) {
            calls++
            if (calls === 1) {
                started?.()
                return new Promise((resolve) => {
                    complete = resolve
                })
            }
            if (query === true) {
                return Promise.resolve([[1, 0]])
            }
            return Promise.resolve(texts.map(() => [0, 1]))
        },
    }
    const cache = new PersistentVectorCache(await path(), profile)
    const search = index(fake, cache)
    search.remember('wood', 'старое', true)
    await waiting
    search.remember('wood', 'новое', true)
    complete?.([[1, 0]])
    await search.idle()
    expect(await cache.get('старое')).toBeUndefined()
    expect(await cache.get('новое')).toEqual([0, 1])
    expect((await search.rank('что', ['wood'])).get('wood')).toBe(0)
})

it('persists only authored knowledge, never memory, queries or own discoveries', async () => {
    const file = await path()
    const cache = new PersistentVectorCache(file, profile)
    const fake = provider(cache)
    const actor = new GameCharacter({
        id: 'owner',
        nickname: 'Гость',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 16, y: 16 },
    })
    const navigation = new NavigationService({
        id: 'map-2-2',
        width: 4,
        height: 4,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array.from({ length: 16 }, () => false),
        solidLayerNames: [],
    })
    const entries: KnowledgeEntry[] = [
        {
            id: 'public',
            group: 'world.common',
            source: 'authored:knowledge:public',
            text: 'Лунная древесина',
            aliases: ['тайная рубка'],
        },
        {
            id: 'own-star:owner:one',
            group: 'personal.discovered',
            source: 'authoritative:own-discovered-star',
            text: 'Личное открытие древесины',
        },
    ]
    const memory = new CharacterMemory('only-owner')
    memory.remember({
        id: 'm',
        senderId: 'friend',
        senderName: 'Друг',
        text: 'Секретный разговор древесины',
        channel: 'whisper',
        source: 'heard',
        at: 1,
        locationId: 'map-2-2',
    })
    const knowledge = new CharacterKnowledge(
        fake,
        () => undefined,
        () => entries
    )
    try {
        await knowledge.retrieve(actor, navigation, memory, 'Запрос древесины')
    } finally {
        knowledge.stop()
    }
    await cache.flush()
    expect(await cache.get('Лунная древесина\nтайная рубка')).toEqual([1, 0])
    expect(await cache.get(entries[1]?.text ?? '')).toBeUndefined()
    expect(await cache.get('Секретный разговор древесины')).toBeUndefined()
    expect(await cache.get('Запрос древесины')).toBeUndefined()
    const disk = await readFile(file, 'utf8')
    expect(disk).not.toMatch(
        /Лунная|тайная|Секретный|Запрос|owner|friend|public/
    )
})

it('fingerprints the actual model checksums and shared inference/tokenization options', () => {
    const manifest = {
        modelId: modelProfile.modelId,
        modelRevision: modelProfile.modelRevision,
        files: Object.fromEntries(
            modelProfile.modelFiles.map((file) => [file, 'a'.repeat(64)])
        ),
    }
    const first = embeddingCacheProfile(manifest)
    const changed = structuredClone(manifest)
    changed.files['tokenizer.json'] = 'b'.repeat(64)
    expect(embeddingCacheProfile(changed).fingerprint).not.toBe(
        first.fingerprint
    )
    expect(first.dimensions).toBe(modelProfile.dimensions)
    expect(() =>
        embeddingCacheProfile({ ...manifest, modelRevision: 'wrong' })
    ).toThrow('Invalid embedding')
})
