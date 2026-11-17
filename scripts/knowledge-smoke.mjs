import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

import { maxPassageTokens } from './knowledge-model.mjs'

const articles = JSON.parse(
    execFileSync(
        'bun',
        [
            fileURLToPath(new URL('knowledge-check.ts', import.meta.url)),
            '--json',
        ],
        { encoding: 'utf8' }
    )
)
const requests = [
    {
        id: 'geography-query',
        texts: ['Где находится северная застава?'],
        query: true,
    },
    {
        id: 'geography-passages',
        texts: [
            'Северная застава расположена к северу от Новогорода.',
            'Яблоко — предмет еды из инвентаря.',
        ],
    },
    { id: 'chopping-query', texts: ['Как срубить дерево?'], query: true },
    {
        id: 'yield-query',
        texts: ['Сколько древесины и саженцев получают с дерева?'],
        query: true,
    },
]
for (let offset = 0; offset < articles.length; offset += 16) {
    const texts = articles
        .slice(offset, offset + 16)
        .map((article) => article.searchText)
    requests.push(
        { id: `tokens:${offset}`, op: 'tokenize', texts },
        { id: `passages:${offset}`, texts }
    )
}
const worker = spawn(
    process.execPath,
    [fileURLToPath(new URL('knowledge-embeddings.mjs', import.meta.url))],
    { stdio: 'pipe' }
)
let output = ''
let errors = ''
worker.stdout.setEncoding('utf8').on('data', (chunk) => {
    output += chunk
})
worker.stderr.setEncoding('utf8').on('data', (chunk) => {
    errors += chunk
})
const timeout = setTimeout(() => worker.kill(), 60_000)
worker.stdin.end(
    requests.map((request) => JSON.stringify(request)).join('\n') + '\n'
)
const [code] = await once(worker, 'exit')
clearTimeout(timeout)
assert.equal(code, 0, errors)
const replies = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
assert.equal(replies.length, requests.length)
for (const reply of replies) assert.equal(reply.error, undefined, reply.error)
const result = new Map(replies.map((reply) => [reply.id, reply]))
const query = result.get('geography-query').vectors[0]
assert.equal(query.length, 384)
const norm = Math.hypot(...query)
assert.ok(Math.abs(norm - 1) < 0.001)
const similarity = (left, right) =>
    left.reduce((sum, value, index) => sum + value * right[index], 0)
const scores = result
    .get('geography-passages')
    .vectors.map((vector) => similarity(query, vector))
assert.ok(
    scores[0] > scores[1],
    'Russian geography must rank above an unrelated item'
)
const vectors = []
let largestPassage = 0
for (let offset = 0; offset < articles.length; offset += 16) {
    const counts = result.get(`tokens:${offset}`).tokenCounts
    for (let index = 0; index < counts.length; index++) {
        const article = articles[offset + index]
        assert.ok(
            counts[index] <= maxPassageTokens,
            `${article.id}: ${counts[index]} tokens exceeds ${maxPassageTokens}; split this article`
        )
        largestPassage = Math.max(largestPassage, counts[index])
    }
    vectors.push(...result.get(`passages:${offset}`).vectors)
}
const top = (id) => {
    const vector = result.get(id).vectors[0]
    return articles
        .map((article, index) => ({
            id: article.id,
            score: similarity(vector, vectors[index]),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, 6)
        .map((article) => article.id)
}
assert.ok(
    top('chopping-query').includes('forestry.chopping'),
    'General chopping must be retrieved'
)
assert.ok(
    top('yield-query').includes('forestry.chopping.expert'),
    'Expert yield must be retrieved'
)
const scoped = JSON.parse(
    execFileSync(
        'bun',
        [
            fileURLToPath(
                new URL('knowledge-retrieval-smoke.ts', import.meta.url)
            ),
        ],
        { encoding: 'utf8' }
    )
)
assert.equal(scoped.unauthorized, 0)
// A separate process has no in-memory index to hide a broken disk cache.
const restarted = JSON.parse(
    execFileSync(
        'bun',
        [
            fileURLToPath(
                new URL('knowledge-retrieval-smoke.ts', import.meta.url)
            ),
        ],
        { encoding: 'utf8' }
    )
)
assert.equal(restarted.unauthorized, 0)
assert.equal(
    restarted.authoredPassageEmbeddings,
    0,
    'Restart must reuse saved authored vectors'
)
assert.equal(
    restarted.queryEmbeddings,
    restarted.queries,
    'Search queries still need embeddings'
)
console.info(
    JSON.stringify({
        model: 'multilingual-e5-small q8',
        dimensions: query.length,
        norm: Number(norm.toFixed(5)),
        relevantScore: Number(scores[0].toFixed(5)),
        unrelatedScore: Number(scores[1].toFixed(5)),
        articles: articles.length,
        largestPassageTokens: largestPassage,
        maxPassageTokens,
        scopedActors: scoped.actors,
        scopedQueries: scoped.queries,
        unauthorized: scoped.unauthorized,
        authoredEmbeddingsBeforeRestart: scoped.authoredPassageEmbeddings,
        authoredEmbeddingsAfterRestart: restarted.authoredPassageEmbeddings,
        cacheReused: true,
        localOnly: true,
    })
)
