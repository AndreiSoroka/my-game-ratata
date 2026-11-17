import {
    isKnowledgeAudience,
    type KnowledgeAudienceClause,
} from './knowledgeAudiences'

export const KNOWLEDGE_ARTICLE_MAX_CHARS = 1500
export const KNOWLEDGE_EMBEDDING_MAX_CHARS = 1800

export interface KnowledgeArticle {
    readonly id: string
    readonly title: string
    readonly text: string
    readonly audiences: readonly KnowledgeAudienceClause[]
    readonly aliases: readonly string[]
    readonly extends?: string
    readonly sources: readonly string[]
    readonly checks: readonly string[]
    readonly facts: Readonly<Record<string, number>>
    /** Repository-relative authoring reference; never included in model context. */
    readonly file: string
}

const metadataKeys = new Set([
    'id',
    'file',
    'audiences',
    'aliases',
    'extends',
    'sources',
    'checks',
    'facts',
])
const forbiddenPresentation =
    /\b(?:WASD|UI|HUD|MCP|JSON|WebSocket|Excalibur|localhost)\b|нажмите|клавиш[ауыеи]|кнопк[ауыеи]|https?:\/\//iu

export function manifestArticles(value: unknown): unknown[] {
    if (
        !record(value) ||
        Object.keys(value).some(
            (key) => key !== 'schemaVersion' && key !== 'articles'
        ) ||
        value['schemaVersion'] !== 1 ||
        !Array.isArray(value['articles']) ||
        value['articles'].length === 0
    ) {
        throw new Error('Invalid knowledge catalog schema')
    }
    return value['articles'] as unknown[]
}

export function parseKnowledgeMetadata(
    value: unknown,
    label: string,
    compiled = false
): Record<string, unknown> {
    if (!record(value)) {
        throw new Error(`Knowledge metadata must be an object: ${label}`)
    }
    for (const key of Object.keys(value)) {
        if (
            !metadataKeys.has(key) &&
            !(compiled && (key === 'title' || key === 'text'))
        ) {
            throw new Error(`Unknown knowledge field ${key}: ${label}`)
        }
    }
    return value
}

/** Catalog paths use portable relative slashes, never filesystem predicates. */
export function knowledgeRelativePath(value: unknown): string {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        /[\\:]/u.test(value) ||
        value.includes('\0') ||
        value
            .split('/')
            .some((part) => part.length === 0 || part.startsWith('.'))
    ) {
        throw new Error(`Invalid knowledge path: ${String(value)}`)
    }
    return value
}

export function knowledgeArticlePath(value: unknown, compiled = false): string {
    const path = knowledgeRelativePath(value)
    const relative = compiled ? path.slice('knowledge/'.length) : path
    if (
        (compiled && !path.startsWith('knowledge/')) ||
        !relative.endsWith('.md') ||
        relative.split('/').at(-1)?.toLowerCase() === 'readme.md'
    ) {
        throw new Error(`Invalid knowledge article file: ${path}`)
    }
    return relative
}

export function normalizedKnowledgeArticle(
    value: unknown,
    body: unknown,
    label: string,
    compiled = false
): KnowledgeArticle {
    const metadata = parseKnowledgeMetadata(value, label, compiled)
    const file = `knowledge/${knowledgeArticlePath(metadata['file'], compiled)}`
    const aliases = strings(metadata['aliases'], 'aliases', file)
    const sources = strings(metadata['sources'], 'sources', file)
    const checks = strings(metadata['checks'], 'checks', file)
    for (const reference of [...sources, ...checks]) {
        knowledgeRelativePath(reference)
    }
    const parent = articleParent(metadata['extends'], file)
    const { title, text } = articleProse(body, aliases, file)
    if (compiled && metadata['title'] !== title) {
        throw new Error(`Knowledge title differs from its text: ${file}`)
    }
    return Object.freeze({
        id: articleId(metadata['id'], file),
        title,
        text,
        audiences: audienceClauses(metadata['audiences'], file),
        aliases,
        ...(parent === undefined ? {} : { extends: parent }),
        sources,
        checks,
        facts: facts(metadata['facts'], file),
        file,
    })
}

function articleId(value: unknown, file: string): string {
    if (
        typeof value !== 'string' ||
        !/^[a-z][a-zA-Z0-9_-]*(?:[.:][a-zA-Z0-9_-]+)*$/u.test(value)
    ) {
        throw new Error(`Invalid knowledge id: ${file}`)
    }
    return value
}

function articleParent(value: unknown, file: string): string | undefined {
    return value === undefined ? undefined : articleId(value, file)
}

function articleProse(
    body: unknown,
    aliases: readonly string[],
    file: string
): { title: string; text: string } {
    if (typeof body !== 'string') {
        throw new Error(`Missing knowledge article text: ${file}`)
    }
    const text = body.replace(/\r\n/gu, '\n').trim()
    const title = /^# ([^\n]+)(?:\n|$)/u.exec(text)?.[1]
    if (title === undefined || text.length > KNOWLEDGE_ARTICLE_MAX_CHARS) {
        throw new Error(
            `Knowledge needs a heading and at most ${String(KNOWLEDGE_ARTICLE_MAX_CHARS)} characters: ${file}`
        )
    }
    if (
        `${aliases.join(' ')}\n${text}`.length > KNOWLEDGE_EMBEDDING_MAX_CHARS
    ) {
        throw new Error(`Knowledge embedding text is too long: ${file}`)
    }
    if (forbiddenPresentation.test(text) || text.includes('```')) {
        throw new Error(`Knowledge must use in-world prose: ${file}`)
    }
    return { title, text }
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(
    value: unknown,
    field: string,
    file: string
): readonly string[] {
    if (value === undefined) {
        return Object.freeze([])
    }
    if (
        !Array.isArray(value) ||
        value.some(
            (item) => typeof item !== 'string' || item.trim().length === 0
        )
    ) {
        throw new Error(`Invalid knowledge ${field}: ${file}`)
    }
    return Object.freeze([...(value as string[])])
}

function audienceClauses(
    value: unknown,
    file: string
): readonly KnowledgeAudienceClause[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`Knowledge audiences must not be empty: ${file}`)
    }
    const clauses = value.map((clause: unknown) => {
        const atoms = typeof clause === 'string' ? [clause] : clause
        if (
            !Array.isArray(atoms) ||
            atoms.length === 0 ||
            atoms.some(
                (atom) => typeof atom !== 'string' || !isKnowledgeAudience(atom)
            )
        ) {
            throw new Error(`Unknown knowledge audience: ${file}`)
        }
        return typeof clause === 'string'
            ? clause
            : Object.freeze([...(atoms as string[])])
    })
    return Object.freeze(clauses)
}

function facts(value: unknown, file: string): Readonly<Record<string, number>> {
    if (value === undefined) {
        return Object.freeze({})
    }
    if (
        !record(value) ||
        Object.entries(value).some(
            ([id, number]) =>
                !/^[a-z][a-zA-Z0-9_.:-]+$/u.test(id) ||
                typeof number !== 'number' ||
                !Number.isFinite(number)
        )
    ) {
        throw new Error(`Invalid knowledge facts: ${file}`)
    }
    return Object.freeze({ ...(value as Record<string, number>) })
}
