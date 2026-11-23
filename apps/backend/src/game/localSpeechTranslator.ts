import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

import type { GameLocale } from '@my-game-ratata/contracts'

import type { SpeechTranslator } from './speechTranslation'

const queueLimit = 24
const deadlineMs = 4_000
const warmupMs = 60_000
const retryDelayMs = 30_000
const directions = ['en-ru', 'ru-en']

interface TranslationJob {
    id: number
    from: GameLocale
    text: string
    deadline: number
    resolve: (text: string | undefined) => void
}

export class LocalSpeechTranslator implements SpeechTranslator {
    private child: ChildProcessWithoutNullStreams | undefined
    private readonly queue: TranslationJob[] = []
    private active: TranslationJob | undefined
    private timer: ReturnType<typeof setTimeout> | undefined
    private serial = 0
    private ready = false
    private stopped = false
    private retryAt = 0

    public static create(): LocalSpeechTranslator | undefined {
        if (process.env['GAME_SPEECH_TRANSLATION'] === '0') {
            return undefined
        }
        const worker = [
            './speech-translation-worker.mjs',
            '../../../../scripts/speech-translation-worker.mjs',
        ]
            .map((path) => fileURLToPath(new URL(path, import.meta.url)))
            .find((path) => existsSync(path))
        if (worker === undefined) {
            return undefined
        }
        const directory = dirname(worker)
        const modelRoot = resolve(
            process.env['GAME_TRANSLATION_MODELS'] ??
                resolve(
                    directory,
                    basename(directory) === 'backend'
                        ? '../../.cache/ratata-translation'
                        : '../.cache/ratata-translation'
                )
        )
        if (
            directions.some(
                (direction) =>
                    !existsSync(
                        resolve(
                            modelRoot,
                            `Xenova/opus-mt-${direction}/ratata-manifest.json`
                        )
                    )
            )
        ) {
            console.info(
                'Speech translation models are missing. Run bun run translation:prepare to enable them.'
            )
            return undefined
        }
        return new LocalSpeechTranslator(worker, modelRoot)
    }

    private constructor(
        private readonly worker: string,
        private readonly modelRoot: string
    ) {
        this.start()
    }

    public translate(
        text: string,
        from: GameLocale,
        to: GameLocale
    ): Promise<string | undefined> {
        if (
            this.stopped ||
            from === to ||
            text.length === 0 ||
            text.length > 400
        ) {
            return Promise.resolve(undefined)
        }
        if (this.child === undefined && Date.now() >= this.retryAt) {
            this.start()
        }
        if (!this.ready || this.queue.length >= queueLimit) {
            return Promise.resolve(undefined)
        }
        return new Promise((resolveJob) => {
            this.queue.push({
                id: ++this.serial,
                from,
                text,
                deadline: Date.now() + deadlineMs,
                resolve: resolveJob,
            })
            this.sendNext()
        })
    }

    public stop(): void {
        this.stopped = true
        this.disconnect()
    }

    private start(): void {
        const child = spawn(
            process.env['GAME_TRANSLATION_NODE'] ?? 'node',
            [this.worker],
            {
                stdio: 'pipe',
                env: {
                    ...process.env,
                    GAME_TRANSLATION_MODELS: this.modelRoot,
                },
            }
        )
        this.child = child
        const fail = () => {
            if (this.child !== child) {
                return
            }
            this.retryAt = Date.now() + retryDelayMs
            this.disconnect()
            console.warn(
                'Local speech translation worker unavailable; displaying original speech.'
            )
        }
        this.timer = setTimeout(fail, warmupMs)
        const lines = createInterface({ input: child.stdout })
        lines.on('line', (line) => {
            if (this.child !== child) {
                return
            }
            try {
                this.receive(
                    JSON.parse(line) as {
                        ready?: boolean
                        id?: number
                        text?: string
                    }
                )
            } catch {
                fail()
            }
        })
        child.stderr.resume()
        child.on('error', fail)
        child.on('exit', fail)
        child.stdin.on('error', fail)
    }

    private receive(message: {
        ready?: boolean
        id?: number
        text?: string
    }): void {
        if (!this.ready && message.ready === true) {
            clearTimeout(this.timer)
            this.ready = true
            return
        }
        const active = this.active
        if (active === undefined || message.id !== active.id) {
            return
        }
        clearTimeout(this.timer)
        this.active = undefined
        const text = typeof message.text === 'string' ? message.text.trim() : ''
        active.resolve(
            text.length > 0 &&
                text.length <= 800 &&
                Date.now() <= active.deadline
                ? text
                : undefined
        )
        this.sendNext()
    }

    private sendNext(): void {
        if (this.active !== undefined || this.child === undefined) {
            return
        }
        for (
            let job = this.queue.shift();
            job !== undefined;
            job = this.queue.shift()
        ) {
            const remaining = job.deadline - Date.now()
            if (remaining <= 0) {
                job.resolve(undefined)
                continue
            }
            this.active = job
            this.timer = setTimeout(() => {
                this.retryAt = Date.now() + retryDelayMs
                this.disconnect()
            }, deadlineMs)
            this.child.stdin.write(
                `${JSON.stringify({ id: job.id, from: job.from, text: job.text })}\n`
            )
            return
        }
    }

    private disconnect(): void {
        clearTimeout(this.timer)
        const child = this.child
        this.child = undefined
        this.ready = false
        child?.kill()
        this.active?.resolve(undefined)
        this.active = undefined
        for (const job of this.queue.splice(0)) {
            job.resolve(undefined)
        }
    }
}
