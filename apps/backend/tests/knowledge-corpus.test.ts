import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

import {
    loadCompiledKnowledgeCorpus,
    loadKnowledgeCorpus,
    parseKnowledgeArticle,
    serializeKnowledgeCorpus,
} from '../src/ai/knowledgeCorpus'

const directories: string[] = []
afterEach(() => {
    for (const directory of directories.splice(0)) {
        rmSync(directory, { recursive: true, force: true })
    }
    vi.doUnmock('node:fs')
})

function metadata(overrides: Record<string, unknown> = {}) {
    return {
        id: 'forestry.example',
        file: 'example.md',
        audiences: ['common'],
        ...overrides,
    }
}
const prose = '# Рубка\n\nТопор нужно взять в руку.'
function directory(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'ratata-knowledge-'))
    directories.push(root)
    for (const [name, value] of Object.entries(files)) {
        const path = join(root, name)
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, value)
    }
    return root
}
function source(
    entries: unknown[] = [metadata()],
    files: Record<string, string> = { 'example.md': prose }
): string {
    return directory({
        'catalog.json': JSON.stringify({ schemaVersion: 1, articles: entries }),
        ...files,
    })
}
function compiled(value: unknown): string {
    const root = directory({ 'knowledge.json': JSON.stringify(value) })
    return join(root, 'knowledge.json')
}

it('keeps pure prose and immutable central authoring metadata separate', () => {
    const aliases = ['рубка', 'дрова']
    const parsed = parseKnowledgeArticle(
        prose,
        metadata({
            aliases,
            sources: ['apps/backend/src/game/harvestRules.ts'],
            checks: ['apps/backend/tests/harvesting.test.ts'],
            facts: { 'forestry.adult.wood': 8 },
        })
    )
    expect(parsed.title).toBe('Рубка')
    expect(parsed.text).toBe(prose)
    expect(parsed.file).toBe('knowledge/example.md')
    expect(parsed.facts).toEqual({ 'forestry.adult.wood': 8 })
    aliases.push('пень')
    expect(parsed.aliases).toEqual(['рубка', 'дрова'])
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.audiences)).toBe(true)
})

it.each([
    { id: 'bad id' },
    { unknownField: true },
    { audiences: [] },
    { audiences: ['profession:typo'] },
    { audiences: [['profession:lumberjack', 'resident:map-9-9']] },
    { audiences: ['character:someone-hidden'] },
    { audiences: [[[]]] },
    { facts: { 'forestry.adult.wood': NaN } },
    { sources: ['../private.txt'] },
    { checks: ['/private/test.ts'] },
    { aliases: 'не список' },
])('rejects invalid authoring metadata: %j', (overrides) => {
    expect(() => parseKnowledgeArticle(prose, metadata(overrides))).toThrow()
})

it.each([
    '../private.md',
    '/private.md',
    'C:\\private.md',
    'nested\\article.md',
    './example.md',
    'README.md',
    'example.txt',
])('rejects unsafe or non-article paths: %s', (file) => {
    expect(() => parseKnowledgeArticle(prose, metadata({ file }))).toThrow()
})

it('rejects frontmatter, missing headings and developer instructions in Markdown', () => {
    for (const body of [
        '---\nid: misplaced\n---\n# Тема',
        'Без заголовка',
        '# Управление\nНажмите клавишу F.',
        '# Путь\n```js\nrun()\n```',
    ]) {
        expect(() => parseKnowledgeArticle(body, metadata())).toThrow()
    }
})

it('requires complete short articles instead of silently truncating them', () => {
    expect(() =>
        parseKnowledgeArticle(`# Тема\n${'а'.repeat(1500)}`, metadata())
    ).toThrow(/characters/u)
    expect(() =>
        parseKnowledgeArticle(prose, metadata({ aliases: ['а'.repeat(1800)] }))
    ).toThrow(/embedding/u)
    const tail = 'Пень убирают только топором.'
    const text = `# Рубка\n${'Дерево растёт. '.repeat(70)}${tail}`
    expect(parseKnowledgeArticle(text, metadata()).text.endsWith(tail)).toBe(
        true
    )
})

it.each([
    { schemaVersion: 2, articles: [metadata()] },
    { schemaVersion: 1, articles: [] },
    { schemaVersion: 1, articles: [metadata()], unknown: true },
    { articles: [metadata()] },
])('validates the manifest version and shape: %j', (value) => {
    expect(() => loadCompiledKnowledgeCorpus(compiled(value))).toThrow(
        /schema/u
    )
})

it('validates source references while a compiled artifact needs no repository files', () => {
    const root = source([
        metadata({ sources: ['apps/backend/src/game/does-not-exist.ts'] }),
    ])
    expect(() =>
        loadKnowledgeCorpus(root, {
            repositoryRoot: process.cwd(),
            validateReferences: true,
        })
    ).toThrow(/Missing knowledge reference/u)
    const articles = loadKnowledgeCorpus(root, { validateReferences: false })
    expect(
        loadCompiledKnowledgeCorpus(
            compiled(serializeKnowledgeCorpus(articles))
        )
    ).toEqual(articles)
})

it('rejects duplicate identities, repeated files and missing articles', () => {
    const files = { 'one.md': prose, 'two.md': prose }
    const duplicate = source(
        [metadata({ file: 'one.md' }), metadata({ file: 'two.md' })],
        files
    )
    expect(() => loadKnowledgeCorpus(duplicate)).toThrow(
        /Duplicate knowledge id/u
    )
    const repeated = source([metadata(), metadata({ id: 'other.article' })])
    expect(() => loadKnowledgeCorpus(repeated)).toThrow(
        /Repeated knowledge article file/u
    )
    const missing = source([metadata({ file: 'absent.md' })])
    expect(() => loadKnowledgeCorpus(missing)).toThrow(
        /Missing knowledge article/u
    )
})

it('rejects unlisted Markdown, missing parents and dependency cycles', () => {
    const unlisted = source([metadata()], {
        'example.md': prose,
        'unlisted.md': prose,
    })
    expect(() => loadKnowledgeCorpus(unlisted)).toThrow(
        /Unlisted knowledge article/u
    )
    const missing = source([metadata({ extends: 'absent.article' })])
    expect(() => loadKnowledgeCorpus(missing)).toThrow(
        /Unknown knowledge parent/u
    )
    const cycle = source(
        [
            metadata({ extends: 'forestry.other' }),
            metadata({
                id: 'forestry.other',
                file: 'other.md',
                extends: 'forestry.example',
            }),
        ],
        { 'example.md': prose, 'other.md': prose }
    )
    expect(() => loadKnowledgeCorpus(cycle)).toThrow(/cycle/u)
})

it('loads author-selected order, validates a parent chain and ignores READMEs', () => {
    const root = source(
        [
            metadata({
                id: 'forestry.expert',
                file: 'expert.md',
                extends: 'forestry.example',
                audiences: [
                    ['profession:lumberjack', 'resident:map-2-2'],
                    'character:npc_magic_slime_1',
                ],
            }),
            metadata(),
        ],
        { 'README.md': '# Авторам', 'example.md': prose, 'expert.md': prose }
    )
    const articles = loadKnowledgeCorpus(root)
    expect(articles.map(({ id }) => id)).toEqual([
        'forestry.expert',
        'forestry.example',
    ])
    expect(articles[0]?.audiences).toEqual([
        ['profession:lumberjack', 'resident:map-2-2'],
        'character:npc_magic_slime_1',
    ])
    expect(Object.isFrozen(articles[0]?.audiences[0])).toBe(true)
})

it('rejects symlink escapes, including a catalog outside the corpus root', () => {
    const outside = directory({
        'article.md': prose,
        'catalog.json': JSON.stringify({
            schemaVersion: 1,
            articles: [metadata()],
        }),
    })
    const root = source([metadata({ file: 'linked.md' })], {})
    symlinkSync(join(outside, 'article.md'), join(root, 'linked.md'))
    expect(() => loadKnowledgeCorpus(root)).toThrow(/escapes/u)
    rmSync(join(root, 'catalog.json'))
    symlinkSync(join(outside, 'catalog.json'), join(root, 'catalog.json'))
    expect(() => loadKnowledgeCorpus(root)).toThrow(/escapes/u)
})

it('rejects directory symlink escapes and multiple names for the same body', () => {
    const outside = directory({ 'article.md': prose })
    const root = source([metadata({ file: 'nested/article.md' })], {})
    symlinkSync(outside, join(root, 'nested'))
    expect(() => loadKnowledgeCorpus(root)).toThrow(/escapes/u)
    const repeated = source([
        metadata(),
        metadata({ id: 'other.article', file: 'alias.md' }),
    ])
    symlinkSync(join(repeated, 'example.md'), join(repeated, 'alias.md'))
    expect(() => loadKnowledgeCorpus(repeated)).toThrow(
        /Repeated knowledge article file/u
    )
})

it('validates compiled text, title, access metadata and dependency identities', () => {
    const articles = loadKnowledgeCorpus(source())
    const original = articles[0]
    expect(original).toBeDefined()
    for (const overrides of [
        { title: 'Не тот заголовок' },
        { audiences: ['profession:typo'] },
        { text: 12 },
        { file: '../secret.md' },
        { unknown: true },
    ]) {
        expect(() =>
            loadCompiledKnowledgeCorpus(
                compiled({
                    schemaVersion: 1,
                    articles: [{ ...original, ...overrides }],
                })
            )
        ).toThrow()
    }
    expect(() =>
        loadCompiledKnowledgeCorpus(
            compiled({ schemaVersion: 1, articles: [original, original] })
        )
    ).toThrow(/Duplicate knowledge id/u)
})

it('preserves every article and all validation metadata in the standalone compiled artifact', () => {
    const articles = loadKnowledgeCorpus()
    const deployed = loadCompiledKnowledgeCorpus(
        compiled(serializeKnowledgeCorpus(articles))
    )
    expect(deployed).toEqual(articles)
    expect(Object.isFrozen(deployed)).toBe(true)
})

it('reads the catalog once and caches its immutable articles without rereading files', async () => {
    const actual = await import('node:fs')
    const reads = vi.fn(actual.readFileSync)
    vi.resetModules()
    vi.doMock('node:fs', () => ({
        ...actual,
        readFileSync: reads,
    }))
    const module = await import('../src/ai/knowledgeCorpus')
    const first = module.knowledgeCorpus()
    const initialReads = reads.mock.calls.length
    expect(initialReads).toBeGreaterThan(0)
    expect(module.knowledgeCorpus()).toBe(first)
    expect(reads).toHaveBeenCalledTimes(initialReads)
})
