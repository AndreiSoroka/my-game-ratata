import { afterEach, expect, it, vi } from 'vitest'

import {
    CharacterKnowledge,
    type KnowledgeEntry,
} from '../src/ai/characterKnowledge'
import { CharacterMemory } from '../src/ai/characterMemory'
import type { EmbeddingProvider } from '../src/ai/localEmbeddings'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'

const running: CharacterKnowledge[] = []
afterEach(() => {
    for (const knowledge of running.splice(0)) {
        knowledge.stop()
    }
})

function actor(id = 'resident'): GameCharacter {
    return new GameCharacter({
        id,
        nickname: 'Сосед',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 32, y: 32 },
    })
}

function navigation(): NavigationService {
    return new NavigationService({
        id: 'map-2-2',
        width: 8,
        height: 8,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array.from({ length: 64 }, () => false),
        solidLayerNames: [],
    })
}

function entry(id: string, text: string): KnowledgeEntry {
    return { id, text, group: 'test', source: `authored:knowledge:${id}` }
}

const orthogonal: EmbeddingProvider = {
    embed: (texts, query) =>
        Promise.resolve(texts.map(() => (query === true ? [1, 0] : [0, 1]))),
}
const unavailable: EmbeddingProvider = {
    embed: () => Promise.reject(new Error('Local model is not prepared')),
}

function knowledge(
    entries: readonly KnowledgeEntry[],
    provider: EmbeddingProvider = orthogonal
): CharacterKnowledge {
    const result = new CharacterKnowledge(
        provider,
        () => undefined,
        () => entries
    )
    running.push(result)
    return result
}

it('retrieves a whole passage beyond the previous 800-character boundary and searches aliases privately', async () => {
    const text = `# Работа в лесу\n${'Лес бывает разным. '.repeat(55)}Пень убирают только топором.`
    const article = Object.assign(entry('forest', text), {
        aliases: ['лесоповал'],
        sources: ['private/developer-path.ts'],
        facts: { hidden: 9 },
        checks: ['private/test-path.ts'],
    })
    const npc = actor()
    const result = await knowledge([article], unavailable).retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'Расскажи про лесоповал'
    )
    expect(result.entries).toEqual([entry('forest', text)])
    expect(result.entries[0]?.text.length).toBeGreaterThan(800)
    expect(JSON.stringify(result)).not.toMatch(
        /лесоповал|developer-path|test-path|hidden/
    )
})

it('includes an allowed general explanation with a matching professional addition', async () => {
    const basic = entry(
        'forestry.chopping',
        'Исправный инструмент берут в руку. Пень убирают топором.'
    )
    const expert = {
        ...entry(
            'forestry.chopping.expert',
            'Выход взрослого дерева: 8 древесины и 2 саженца.'
        ),
        aliases: ['лесоповал'],
        extends: basic.id,
    }
    const npc = actor()
    const result = await knowledge([expert, basic]).retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'лесоповал'
    )
    expect(result.entries.map(({ id }) => id)).toEqual([basic.id, expert.id])
    expect(result.entries[1]).not.toHaveProperty('extends')
    expect(result.entries[1]).not.toHaveProperty('aliases')
})

it('does not follow a professional article link into an unauthorized parent', async () => {
    const expert = {
        ...entry('expert', 'Рубка дерева требует исправного инструмента.'),
        extends: 'another-persons-secret',
    }
    const npc = actor()
    const result = await knowledge([expert]).retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'рубка'
    )
    expect(result.entries).toEqual([entry(expert.id, expert.text)])
    expect(JSON.stringify(result)).not.toContain('another-persons-secret')
})

it('keeps whole passages inside the count and character budgets', async () => {
    const articles = Array.from({ length: 8 }, (_, index) =>
        entry(`article-${String(index)}`, `Рубка. ${'а'.repeat(980)}`)
    )
    const npc = actor()
    const result = await knowledge(articles).retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'рубка'
    )
    expect(result.entries).toHaveLength(4)
    expect(
        result.entries.reduce((sum, row) => sum + row.text.length, 0)
    ).toBeLessThanOrEqual(4_000)
    for (const row of result.entries) {
        expect(row.text).toBe(articles.find(({ id }) => id === row.id)?.text)
    }
    const short = knowledge(
        Array.from({ length: 8 }, (_, index) =>
            entry(`short-${String(index)}`, 'Рубка.')
        )
    )
    expect(
        (
            await short.retrieve(
                npc,
                navigation(),
                new CharacterMemory(npc.id),
                'рубка'
            )
        ).entries
    ).toHaveLength(6)
})

it('includes a complete addition when its parent cannot fit and skips an oversized passage', async () => {
    const expert = {
        ...entry('expert', 'Рубка: у малого дерева нет пня.'),
        extends: 'parent',
    }
    const parent = entry('parent', `Рубка. ${'а'.repeat(4_001)}`)
    const npc = actor()
    const result = await knowledge([expert, parent]).retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'рубка'
    )
    expect(result.entries).toEqual([entry(expert.id, expert.text)])
})

it('returns no arbitrary documents for an empty or unrelated question', async () => {
    const provider = {
        embed: vi.fn((texts: string[], query?: boolean) =>
            orthogonal.embed(texts, query)
        ),
    }
    const search = knowledge(
        [entry('forest', 'Топором рубят деревья.')],
        provider
    )
    const npc = actor()
    const empty = await search.retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        '  '
    )
    expect(empty).toEqual({ groups: [], entries: [], memories: [] })
    expect(provider.embed).not.toHaveBeenCalled()
    const unrelated = await search.retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'Расскажи про звёзды'
    )
    expect(unrelated.entries).toEqual([])
})

it('does not treat generic question words as matches or append weaker semantic associations', async () => {
    const forestry = entry('forestry', 'С дерева получают древесину.')
    const body = {
        ...entry('body', 'Свои силы оценивают приблизительно.'),
        aliases: ['сколько здоровья'],
    }
    const grave = entry('grave', 'Каменную могилу разбивают киркой.')
    const provider: EmbeddingProvider = {
        embed: (texts, query) =>
            Promise.resolve(
                texts.map((text) =>
                    query === true || text.includes('древесину')
                        ? [1, 0]
                        : [0.8, 0.6]
                )
            ),
    }
    const npc = actor()
    const result = await knowledge([forestry, body, grave], provider).retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'Сколько древесины выйдет с дерева?'
    )
    expect(result.entries.map(({ id }) => id)).toEqual([forestry.id])
})

it('keeps semantic paraphrases while dropping less relevant authorized candidates', async () => {
    const forestry = entry('forestry', 'Исправным топором добывают древесину.')
    const grave = entry('grave', 'Каменную могилу разбивают киркой.')
    const provider: EmbeddingProvider = {
        embed: (texts, query) =>
            Promise.resolve(
                texts.map((text) =>
                    query === true
                        ? [1, 0]
                        : text.includes('топором')
                          ? [0.9, Math.sqrt(0.19)]
                          : [0.85, Math.sqrt(0.2775)]
                )
            ),
    }
    const npc = actor()
    const result = await knowledge([forestry, grave], provider).retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'лесоповал'
    )
    expect(result.entries.map(({ id }) => id)).toEqual([forestry.id])
})

it.each([false, true])(
    'never searches a secret outside the authorized set (lexical fallback: %s)',
    async (fallback) => {
        const secret = entry(
            'secret',
            'Северный тайник: лунный ключ спрятан под камнем.'
        )
        const general = entry('general', 'Северная дорога ведёт к лесу.')
        const provider: EmbeddingProvider = fallback
            ? unavailable
            : { embed: (texts) => Promise.resolve(texts.map(() => [1, 0])) }
        const search = new CharacterKnowledge(
            provider,
            () => undefined,
            (npc) => (npc.id === 'owner' ? [secret, general] : [general])
        )
        running.push(search)
        const owner = actor('owner')
        expect(
            (
                await search.retrieve(
                    owner,
                    navigation(),
                    new CharacterMemory(owner.id),
                    'лунный ключ'
                )
            ).entries.some(({ id }) => id === secret.id)
        ).toBe(true)
        const visitor = actor('different-id-same-nickname')
        const result = await search.retrieve(
            visitor,
            navigation(),
            new CharacterMemory(visitor.id),
            'лунный ключ'
        )
        expect(result.entries.some(({ id }) => id === secret.id)).toBe(false)
        expect(JSON.stringify(result)).not.toMatch(/тайник|лунный|secret/)
    }
)

it('revokes an expert grant during async ranking and uses fresh text for retained IDs', async () => {
    let queryStarted: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
        queryStarted = resolve
    })
    let release: ((vectors: number[][]) => void) | undefined
    const provider: EmbeddingProvider = {
        embed: (texts, query) => {
            if (query === true) {
                queryStarted?.()
                return new Promise((resolve) => {
                    release = resolve
                })
            }
            return Promise.resolve(texts.map(() => [1, 0]))
        },
    }
    let basicText = 'Рубка: старое описание.'
    const expert = entry('expert', 'Рубка: 8 древесины и 2 саженца.')
    const search = new CharacterKnowledge(
        provider,
        () => undefined,
        (npc) => [
            entry('basic', basicText),
            ...(npc.tags.has('worker.lumberjack') ? [expert] : []),
        ]
    )
    running.push(search)
    const npc = actor()
    npc.tags.add('worker.lumberjack')
    const request = search.retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'рубка'
    )
    await pending
    npc.tags.delete('worker.lumberjack')
    basicText = 'Рубка: новое описание.'
    release?.([[1, 0]])
    const result = await request
    expect(result.entries).toEqual([entry('basic', basicText)])
    expect(JSON.stringify(result)).not.toMatch(/старое|expert|саженца/)
})

it('discards an in-flight result when its knowledge service is stopped', async () => {
    let queryStarted: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
        queryStarted = resolve
    })
    let release: ((vectors: number[][]) => void) | undefined
    const provider: EmbeddingProvider = {
        embed: (texts, query) => {
            if (query === true) {
                queryStarted?.()
                return new Promise((resolve) => {
                    release = resolve
                })
            }
            return Promise.resolve(texts.map(() => [1, 0]))
        },
    }
    const search = knowledge([entry('forest', 'Рубка дерева.')], provider)
    const npc = actor()
    const request = search.retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'рубка'
    )
    await pending
    search.stop()
    release?.([[1, 0]])
    expect(await request).toEqual({ groups: [], entries: [], memories: [] })
})

it('gives ordinary inhabitants general forestry knowledge and the lumberjack its precise addendum', async () => {
    const search = new CharacterKnowledge(orthogonal, () => undefined)
    running.push(search)
    const resident = actor('npc_wanderer_1')
    const simple = await search.retrieve(
        resident,
        navigation(),
        new CharacterMemory(resident.id),
        'Как срубить дерево?'
    )
    expect(simple.entries.some(({ id }) => id === 'forestry.chopping')).toBe(
        true
    )
    expect(
        simple.entries.some(({ id }) => id === 'forestry.chopping.expert')
    ).toBe(false)
    expect(simple.entries.map(({ text }) => text).join('\n')).not.toMatch(
        /8 древесины|2 саженца/
    )
    const lumberjack = actor('npc_lumberjack_1')
    lumberjack.tags.add('worker.lumberjack')
    const precise = await search.retrieve(
        lumberjack,
        navigation(),
        new CharacterMemory(lumberjack.id),
        'Сколько древесины даёт рубка дерева?'
    )
    expect(
        precise.entries.some(({ id }) => id === 'forestry.chopping.expert')
    ).toBe(true)
    expect(precise.entries.some(({ id }) => id === 'forestry.chopping')).toBe(
        true
    )
    expect(precise.entries.map(({ text }) => text).join('\n')).toContain(
        '8 древесины'
    )
})

it.each([
    'У Игната сейчас точно есть топор? Сколько он стоит?',
    'у игната есть топор? сколько он стоит?',
])(
    'keeps a named merchant question on the actual service: %s',
    async (query) => {
        const search = new CharacterKnowledge(orthogonal, () => undefined)
        running.push(search)
        const npc = actor('npc_wanderer_1')
        const result = await search.retrieve(
            npc,
            navigation(),
            new CharacterMemory(npc.id),
            query
        )
        expect(result.entries.some(({ id }) => id === 'city.ignat')).toBe(true)
        expect(
            result.entries.some(
                ({ id }) => id === 'service-catalog:npc_smith_1'
            )
        ).toBe(true)
        expect(
            result.entries.every(
                ({ id }) => id === 'city.ignat' || id.endsWith(':npc_smith_1')
            )
        ).toBe(true)
    }
)

it.each([
    'Где Игнат и как срубить дерево?',
    'Где Игнат и как рубить деревья?',
    'Где Игнат и как срубить ёлку?',
])('keeps an explicit second topic in lexical fallback: %s', async (query) => {
    const search = new CharacterKnowledge(unavailable, () => undefined)
    running.push(search)
    const npc = actor('npc_wanderer_1')
    const result = await search.retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        query
    )
    expect(result.entries.some(({ id }) => id === 'city.ignat')).toBe(true)
    expect(result.entries.some(({ id }) => id === 'forestry.chopping')).toBe(
        true
    )
})

it('does not mistake a world or faith concept for a person with a similar name', async () => {
    const mira = {
        ...entry('mira', 'Мира работает в гильдии.'),
        aliases: ['Мира'],
    }
    const vera = {
        ...entry('vera', 'Вера служит в часовне.'),
        aliases: ['Вера'],
    }
    const world = {
        ...entry('world', 'Мир состоит из соседних земель.'),
        aliases: ['мир'],
    }
    const faith = {
        ...entry('faith', 'Вера связывает молитву с покровителем.'),
        aliases: ['вера'],
    }
    const npc = actor()
    const search = knowledge([mira, vera, world, faith], unavailable)
    const place = await search.retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'Расскажи про мир'
    )
    expect(place.entries.map(({ id }) => id)).toEqual([world.id])
    const belief = await search.retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'Что такое вера?'
    )
    expect(belief.entries.some(({ id }) => id === faith.id)).toBe(true)
})

it('keeps a stronger semantic action answer when a question also names its actor', async () => {
    const smith = {
        ...entry('smith', 'Игнат продаёт инструменты.'),
        aliases: ['Игнат'],
    }
    const action = entry('action', 'Исправным топором добывают древесину.')
    const provider: EmbeddingProvider = {
        embed: (texts, query) =>
            Promise.resolve(
                texts.map((text) =>
                    query === true || text.includes('древесину')
                        ? [1, 0]
                        : [0.8, 0.6]
                )
            ),
    }
    const npc = actor()
    const result = await knowledge([smith, action], provider).retrieve(
        npc,
        navigation(),
        new CharacterMemory(npc.id),
        'Как Игнат рубит дерево?'
    )
    expect(result.entries.some(({ id }) => id === smith.id)).toBe(true)
    expect(result.entries.some(({ id }) => id === action.id)).toBe(true)
})
