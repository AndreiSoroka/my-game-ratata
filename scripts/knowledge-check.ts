import {
    loadKnowledgeCorpus,
    serializeKnowledgeCorpus,
} from '../apps/backend/src/ai/knowledgeCorpus'
import { validateKnowledgeFacts } from '../apps/backend/src/ai/knowledgeFacts'

const articles = loadKnowledgeCorpus()
for (const article of articles) {
    if (article.sources.length === 0 || article.checks.length === 0) {
        throw new Error(`${article.id}: knowledge needs sources and checks`)
    }
}
validateKnowledgeFacts(articles)
if (process.argv.includes('--compiled')) {
    console.info(JSON.stringify(serializeKnowledgeCorpus(articles)))
} else if (process.argv.includes('--json')) {
    console.info(
        JSON.stringify(
            articles.map(({ id, text, aliases }) => ({
                id,
                text,
                searchText: [text, ...(aliases ?? [])].join('\n'),
            }))
        )
    )
} else {
    console.info(
        `Validated ${String(articles.length)} knowledge articles and their authoritative facts.`
    )
}
