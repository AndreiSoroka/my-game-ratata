import type { GameCharacter } from '../game/character'
import type { NavigationService } from '../game/navigation'
import { type KnowledgeEntry, landmarkText } from './knowledgeCatalog'
import { knowledgeEntityMatches } from './knowledgeEntities'

export type KnowledgePassage = Omit<KnowledgeEntry, 'aliases' | 'extends'>

const MAX_KNOWLEDGE_PASSAGES = 6
const MAX_KNOWLEDGE_CHARACTERS = 4_000
const MIN_SEMANTIC_RELEVANCE = 0.75
const SEMANTIC_PARAPHRASE_MARGIN = 0.025
const queryStopWords = new Set([
    'как',
    'что',
    'это',
    'для',
    'или',
    'мне',
    'можно',
    'нужно',
    'про',
    'где',
    'чтобы',
    'так',
    'есть',
    'его',
    'при',
    'всё',
    'ещё',
    'сколько',
    'какой',
    'какая',
    'какие',
    'когда',
    'почему',
    'зачем',
    'расскажи',
    'пожалуйста',
    'будет',
    'выйдет',
    'получится',
    'получить',
    'получать',
    'получают',
    'получаем',
    'получаешь',
    'получите',
    'получит',
    'дать',
    'дает',
    'дают',
    'давать',
    'дадут',
    'один',
    'одна',
    'одно',
    'одни',
    'одного',
    'одной',
    'одном',
    'одному',
    'одним',
    'одних',
    'одну',
])

export function lexicalKnowledgeScore(query: string, text: string): number {
    const normalized = new Set(
        text
            .toLocaleLowerCase()
            .replaceAll('ё', 'е')
            .match(/[\p{L}\p{N}]{3,}/gu) ?? []
    )
    return [
        ...new Set(
            query
                .toLocaleLowerCase()
                .replaceAll('ё', 'е')
                .match(/[\p{L}\p{N}]{3,}/gu) ?? []
        ),
    ]
        .filter((token) => !queryStopWords.has(token))
        .reduce((sum, token) => sum + Number(normalized.has(token)), 0)
}

export function knowledgeSearchText(entry: KnowledgeEntry): string {
    return [entry.text, ...(entry.aliases ?? [])].join('\n')
}

function passage(
    entry: KnowledgeEntry,
    actor: GameCharacter,
    navigation: NavigationService
): KnowledgePassage {
    return {
        id: entry.id,
        group: entry.group,
        text: landmarkText(entry, actor, navigation),
        source: entry.source,
        ...(entry.locationId === undefined
            ? {}
            : { locationId: entry.locationId }),
        ...(entry.buildingId === undefined
            ? {}
            : { buildingId: entry.buildingId }),
    }
}

/** Dependencies are ordinary knowledge: neither a link nor a high score grants access. */
function boundedPassages(
    ranked: readonly KnowledgeEntry[],
    allowed: ReadonlyMap<string, KnowledgeEntry>,
    actor: GameCharacter,
    navigation: NavigationService
): KnowledgePassage[] {
    const selected = new Map<string, KnowledgePassage>()
    let characters = 0
    const add = (entries: readonly KnowledgeEntry[]): boolean => {
        const additions = entries
            .filter((entry) => !selected.has(entry.id))
            .map((entry) => passage(entry, actor, navigation))
        const length = additions.reduce(
            (total, entry) => total + entry.text.length,
            0
        )
        if (
            selected.size + additions.length > MAX_KNOWLEDGE_PASSAGES ||
            characters + length > MAX_KNOWLEDGE_CHARACTERS
        ) {
            return false
        }
        for (const entry of additions) {
            selected.set(entry.id, entry)
        }
        characters += length
        return true
    }
    for (const entry of ranked) {
        if (selected.has(entry.id)) {
            continue
        }
        const family = [entry]
        const seen = new Set([entry.id])
        let parentId = entry.extends
        while (parentId !== undefined && !seen.has(parentId)) {
            seen.add(parentId)
            const parent = allowed.get(parentId)
            if (parent === undefined) {
                break
            }
            family.unshift(parent)
            parentId = parent.extends
        }
        if (!add(family)) {
            // A long or unavailable dependency must not clip a useful complete answer.
            add([entry])
        }
    }
    return [...selected.values()]
}

interface SelectionInput {
    initial: readonly KnowledgeEntry[]
    current: readonly KnowledgeEntry[]
    scores: ReadonlyMap<string, number>
    query: string
    actor: GameCharacter
    navigation: NavigationService
}

export function selectKnowledgePassages(
    input: SelectionInput
): KnowledgePassage[] {
    const allowed = new Map(input.current.map((entry) => [entry.id, entry]))
    const initialIds = new Set(input.initial.map((entry) => entry.id))
    const candidates = [...allowed.values()].filter((entry) =>
        initialIds.has(entry.id)
    )
    const entities = knowledgeEntityMatches(input.query, candidates)
    const allScores = candidates.map((entry) => ({
        entry,
        lexicalScore:
            lexicalKnowledgeScore(input.query, knowledgeSearchText(entry)) +
            (entities?.get(entry.id) ?? 0),
        semanticScore: input.scores.get(entry.id) ?? 0,
    }))
    const namedSemanticFloor = Math.max(
        MIN_SEMANTIC_RELEVANCE,
        ...allScores
            .filter(({ entry }) => entities?.has(entry.id) === true)
            .map(({ semanticScore }) => semanticScore + 0.01)
    )
    const scored = allScores.filter(
        ({ entry, semanticScore }) =>
            entities === undefined ||
            entities.has(entry.id) ||
            semanticScore >= namedSemanticFloor
    )
    const anchors = scored.filter(({ lexicalScore }) => lexicalScore > 0)
    // Do not pad a good lexical answer with weaker, merely associated topics.
    // For paraphrases without lexical anchors, compare only authorized candidates.
    const semanticFloor = Math.max(
        MIN_SEMANTIC_RELEVANCE,
        anchors.length > 0
            ? Math.max(...anchors.map(({ semanticScore }) => semanticScore)) +
                  0.01
            : Math.max(...scored.map(({ semanticScore }) => semanticScore)) -
                  SEMANTIC_PARAPHRASE_MARGIN
    )
    const ranked = scored
        .filter(
            ({ lexicalScore, semanticScore }) =>
                lexicalScore > 0 || semanticScore >= semanticFloor
        )
        .map(({ entry, lexicalScore, semanticScore }) => ({
            entry,
            score: lexicalScore + semanticScore,
        }))
        .sort((a, b) => b.score - a.score)
        .map(({ entry }) => entry)
    return boundedPassages(ranked, allowed, input.actor, input.navigation)
}
