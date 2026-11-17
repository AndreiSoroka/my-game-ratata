import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

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
worker.stdin.end(
    `${JSON.stringify({ id: 1, texts: ['Где находится северная застава?'], query: true })}\n${JSON.stringify({ id: 2, texts: ['Северная застава расположена к северу от Новогорода.', 'Яблоко — предмет еды из инвентаря.'], query: false })}\n`
)
const [code] = await once(worker, 'exit')
assert.equal(code, 0, errors)
const replies = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
assert.equal(replies.length, 2)
for (const reply of replies) assert.equal(reply.error, undefined)
const query = replies.find((reply) => reply.id === 1).vectors[0]
const passages = replies.find((reply) => reply.id === 2).vectors
assert.equal(query.length, 384)
const norm = Math.hypot(...query)
assert.ok(Math.abs(norm - 1) < 0.001)
const scores = passages.map((vector) =>
    query.reduce((sum, value, index) => sum + value * vector[index], 0)
)
assert.ok(
    scores[0] > scores[1],
    'Russian geography must rank above an unrelated item'
)
console.info(
    JSON.stringify({
        model: 'multilingual-e5-small q8',
        dimensions: query.length,
        norm: Number(norm.toFixed(5)),
        relevantScore: Number(scores[0].toFixed(5)),
        unrelatedScore: Number(scores[1].toFixed(5)),
        localOnly: true,
    })
)
