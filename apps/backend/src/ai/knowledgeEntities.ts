import type { KnowledgeEntry } from './knowledgeCatalog'

function words(text: string): string[] {
    return text.match(/\p{L}{3,}/gu) ?? []
}

function normalized(word: string): string {
    return word.toLocaleLowerCase().replaceAll('ё', 'е')
}

/** Keep valid forms instead of bare stems: Мира must not match the noun мир. */
function nameForms(word: string): ReadonlySet<string> {
    const name = normalized(word)
    let endings: readonly string[]
    if (name.endsWith('а')) {
        endings = ['а', 'ы', 'и', 'е', 'у', 'ой', 'ою']
    } else if (name.endsWith('я')) {
        endings = ['я', 'и', 'е', 'ю', 'ей', 'ею']
    } else if (name.endsWith('й') || name.endsWith('ь')) {
        endings = [name.slice(-1), 'я', 'ю', 'ем', 'е', 'и', 'ью']
    } else {
        return new Set([
            name,
            ...['а', 'у', 'ом', 'е'].map((ending) => name + ending),
        ])
    }
    return new Set(endings.map((ending) => name.slice(0, -1) + ending))
}

function hasSpecificPhrase(query: string, aliases: readonly string[]): boolean {
    const normalized = words(query).join(' ').toLocaleLowerCase()
    return aliases.some((alias) => {
        const terms = words(alias)
        return (
            terms.filter((term) => term.length >= 4).length >= 2 &&
            normalized.includes(terms.join(' ').toLocaleLowerCase())
        )
    })
}

/** Name candidates come only from permitted author-supplied aliases, never a global registry. */
export function knowledgeEntityMatches(
    query: string,
    entries: readonly KnowledgeEntry[]
): ReadonlyMap<string, number> | undefined {
    const clauses = query.split(
        /\s+и\s+(?=(?:как|где|что|сколько|почему|зачем|чем|можно)(?:\s|$))/iu
    )
    // Independent requested topics retain their own lexical search in fallback.
    if (
        clauses.length > 1 ||
        /^\s*что\s+(?:такое|значит)(?:\s|$)/iu.test(query)
    ) {
        return undefined
    }
    const queryNames = new Set(words(query).map(normalized))
    const mentioned = new Map(
        entries.flatMap((entry) =>
            (entry.aliases ?? []).flatMap((alias) =>
                words(alias)
                    .filter((word) => /^\p{Lu}/u.test(word))
                    .map((word) => [normalized(word), nameForms(word)] as const)
                    .filter(([, forms]) =>
                        [...queryNames].some((word) => forms.has(word))
                    )
            )
        )
    )
    if (mentioned.size === 0) {
        return undefined
    }
    const matches = new Map<string, number>()
    for (const entry of entries) {
        const names = words(entry.text).map(normalized)
        const score = [...mentioned.values()].filter((forms) =>
            names.some((word) => forms.has(word))
        ).length
        if (score > 0 || hasSpecificPhrase(query, entry.aliases ?? [])) {
            matches.set(entry.id, score)
        }
    }
    return matches
}
