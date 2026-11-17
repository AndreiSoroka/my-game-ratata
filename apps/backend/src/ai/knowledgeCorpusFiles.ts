import {
    existsSync,
    readdirSync,
    readFileSync,
    realpathSync,
    statSync,
} from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import type { KnowledgeArticle } from './knowledgeCorpusSchema'

function insideRoot(root: string, path: string): string {
    const canonicalRoot = realpathSync(root)
    const canonical = realpathSync(path)
    if (
        canonical !== canonicalRoot &&
        !canonical.startsWith(`${canonicalRoot}${sep}`)
    ) {
        throw new Error(`Knowledge path escapes its root: ${path}`)
    }
    return canonical
}

export function readKnowledgeFile(root: string, file: string): string {
    const path = resolve(root, file)
    insideRoot(root, path)
    if (!statSync(path).isFile()) {
        throw new Error(`Knowledge article must be a file: ${file}`)
    }
    return readFileSync(path, 'utf8')
}

export function validateKnowledgeFiles(
    root: string,
    files: readonly string[]
): void {
    const listed = new Set(files)
    const physical = new Set<string>()
    for (const file of files) {
        const path = resolve(root, file)
        if (!existsSync(path)) {
            throw new Error(`Missing knowledge article: ${file}`)
        }
        const canonical = insideRoot(root, path)
        if (physical.has(canonical)) {
            throw new Error(`Repeated knowledge article file: ${file}`)
        }
        physical.add(canonical)
    }
    for (const path of markdownFiles(root)) {
        const file = relative(root, path).split(sep).join('/')
        if (!listed.has(file)) {
            throw new Error(`Unlisted knowledge article: ${file}`)
        }
    }
}

function markdownFiles(root: string): string[] {
    const visited = new Set<string>()
    const walk = (directory: string): string[] => {
        const canonical = insideRoot(root, directory)
        if (visited.has(canonical)) {
            throw new Error(`Repeated knowledge directory: ${directory}`)
        }
        visited.add(canonical)
        return readdirSync(directory, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name, 'en'))
            .flatMap((entry) => {
                const path = join(directory, entry.name)
                insideRoot(root, path)
                const stat = statSync(path)
                if (stat.isDirectory()) {
                    return walk(path)
                }
                return stat.isFile() &&
                    entry.name.endsWith('.md') &&
                    entry.name.toLowerCase() !== 'readme.md'
                    ? [path]
                    : []
            })
    }
    return walk(root)
}

export function validateKnowledgeReferences(
    articles: readonly KnowledgeArticle[],
    repositoryRoot: string
): void {
    for (const article of articles) {
        for (const reference of [...article.sources, ...article.checks]) {
            const path = resolve(repositoryRoot, reference)
            if (!existsSync(path) || !statSync(path).isFile()) {
                throw new Error(
                    `Missing knowledge reference ${reference}: ${article.file}`
                )
            }
            insideRoot(repositoryRoot, path)
        }
    }
}
