import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

import { models } from './translation-models.mjs'

const worker = spawn(
    process.execPath,
    [
        fileURLToPath(
            new URL('./speech-translation-worker.mjs', import.meta.url)
        ),
    ],
    { stdio: ['pipe', 'pipe', 'inherit'] }
)
const timeout = setTimeout(() => worker.kill(), 120_000)
const replies = createInterface({ input: worker.stdout })[
    Symbol.asyncIterator
]()
try {
    const started = performance.now()
    if (JSON.parse((await replies.next()).value).ready !== true) {
        throw new Error('Translation worker did not become ready')
    }
    console.info(
        `Both models ready in ${Math.round(performance.now() - started)} ms`
    )
    const samples = [
        ['en', models.en.sample],
        ['ru', models.ru.sample],
        [
            'en',
            'I found two baskets of grain and will meet you outside the guild in five minutes.',
        ],
        [
            'ru',
            'Я нашёл две корзины зерна и через пять минут буду у входа в гильдию.',
        ],
    ]
    const latencies = []
    for (let batch = 0; batch < 5; batch++) {
        const submitted = performance.now()
        for (const [index, [from, text]] of samples.entries()) {
            const id = batch * samples.length + index
            worker.stdin.write(`${JSON.stringify({ id, from, text })}\n`)
        }
        for (const [index, [from]] of samples.entries()) {
            const id = batch * samples.length + index
            const response = JSON.parse((await replies.next()).value)
            const targetScript = from === 'en' ? /[а-яё]/iu : /[a-z]/i
            if (
                response.id !== id ||
                typeof response.text !== 'string' ||
                !targetScript.test(response.text)
            ) {
                throw new Error(`Unexpected response for sample ${id}`)
            }
            latencies.push(performance.now() - submitted)
            if (batch === 0) console.info(`${from}: ${response.text}`)
        }
    }
    latencies.sort((left, right) => left - right)
    const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1]
    console.info(
        `Warm p95: ${Math.round(p95)} ms across ${latencies.length} requests (four submitted at a time)`
    )
} finally {
    clearTimeout(timeout)
    worker.stdin.end()
    worker.kill()
}
