import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    readKnowledgeFile,
    validateKnowledgeFiles,
    validateKnowledgeReferences,
} from './knowledgeCorpusFiles'
import {
    type KnowledgeArticle,
    knowledgeArticlePath,
    manifestArticles,
    normalizedKnowledgeArticle,
    parseKnowledgeMetadata,
} from './knowledgeCorpusSchema'

export {
    KNOWLEDGE_ARTICLE_MAX_CHARS,
    KNOWLEDGE_EMBEDDING_MAX_CHARS,
    type KnowledgeArticle,
} from './knowledgeCorpusSchema'

export interface KnowledgeCorpusOptions {
    validateReferences?: boolean
    repositoryRoot?: string
}

let cachedCorpus: readonly KnowledgeArticle[] | undefined

export function defaultKnowledgeRoot(): string {
    return fileURLToPath(new URL('../../../../knowledge/', import.meta.url))
}

/** Source and production each read one immutable catalog once per process. */
export function knowledgeCorpus(): readonly KnowledgeArticle[] {
    if (cachedCorpus === undefined) {
        const bundled = fileURLToPath(
            new URL('./knowledge.json', import.meta.url)
        )
        cachedCorpus =
            basename(fileURLToPath(import.meta.url)) === 'knowledgeCorpus.ts'
                ? loadKnowledgeCorpus()
                : loadCompiledKnowledgeCorpus(bundled)
    }
    return cachedCorpus
}

export function loadKnowledgeCorpus(
    rootPath = defaultKnowledgeRoot(),
    options: KnowledgeCorpusOptions = {}
): readonly KnowledgeArticle[] {
    const root = resolve(rootPath)
    const metadata = manifestArticles(
        JSON.parse(readKnowledgeFile(root, 'catalog.json'))
    ).map((entry) => parseKnowledgeMetadata(entry, 'catalog.json'))
    const files = metadata.map((entry) => knowledgeArticlePath(entry['file']))
    validateKnowledgeFiles(root, files)
    const articles = validateCatalog(
        metadata.map((entry, index) => {
            const file = files[index]
            if (file === undefined) {
                throw new Error('Missing knowledge article path')
            }
            return parseKnowledgeArticle(
                readKnowledgeFile(root, file),
                entry,
                file
            )
        })
    )
    const repositoryRoot = resolve(options.repositoryRoot ?? dirname(root))
    if (
        options.validateReferences ??
        existsSync(join(repositoryRoot, 'contracts/src/world.ts'))
    ) {
        validateKnowledgeReferences(articles, repositoryRoot)
    }
    return articles
}

/** Plain Markdown supplies only the heading and prose; metadata belongs to catalog.json. */
export function parseKnowledgeArticle(
    markdown: string,
    metadata: unknown,
    fileLabel = 'knowledge article'
): KnowledgeArticle {
    return normalizedKnowledgeArticle(metadata, markdown, fileLabel)
}

export function loadCompiledKnowledgeCorpus(
    path: string
): readonly KnowledgeArticle[] {
    const entries = manifestArticles(JSON.parse(readFileSync(path, 'utf8')))
    return validateCatalog(
        entries.map((entry) => {
            const metadata = parseKnowledgeMetadata(entry, path, true)
            return normalizedKnowledgeArticle(
                metadata,
                metadata['text'],
                path,
                true
            )
        })
    )
}

export function serializeKnowledgeCorpus(
    articles: readonly KnowledgeArticle[]
) {
    return { schemaVersion: 1, articles }
}

function validateCatalog(
    articles: KnowledgeArticle[]
): readonly KnowledgeArticle[] {
    const ids = new Map<string, KnowledgeArticle>()
    const files = new Set<string>()
    for (const article of articles) {
        if (ids.has(article.id)) {
            throw new Error(`Duplicate knowledge id: ${article.id}`)
        }
        if (files.has(article.file)) {
            throw new Error(`Repeated knowledge article file: ${article.file}`)
        }
        ids.set(article.id, article)
        files.add(article.file)
    }
    for (const article of articles) {
        const visited = new Set([article.id])
        let parentId = article.extends
        while (parentId !== undefined) {
            const parent = ids.get(parentId)
            if (parent === undefined) {
                throw new Error(
                    `Unknown knowledge parent ${parentId}: ${article.file}`
                )
            }
            if (visited.has(parent.id)) {
                throw new Error(`Knowledge extends cycle: ${article.id}`)
            }
            visited.add(parent.id)
            parentId = parent.extends
        }
    }
    return Object.freeze(articles)
}
