import { Readable } from 'node:stream'
import { setImmediate as nextTurn } from 'node:timers/promises'

import { expect, it, vi } from 'vitest'

import {
    CodexCliProvider,
    type NpcAiProcess,
    type NpcAiSpawn,
} from '../src/ai/codexCliProvider'
import { defaultNpcAiSettings } from '../src/ai/config'
import type { NpcAiContext, NpcAiReply } from '../src/ai/types'

vi.mock('node:fs/promises', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:fs/promises')>()),
    mkdtemp: () => Promise.resolve('/tmp/npc-ai-serialization-test'),
    writeFile: () => Promise.resolve(),
    rm: () => Promise.resolve(),
}))

const context = { actorId: 'test-actor' } as NpcAiContext
const reply: NpcAiReply = { decision: null, memory: '', done: true, waitMs: 0 }
const transcript = [
    JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: JSON.stringify(reply) },
    }),
    JSON.stringify({ type: 'turn.completed' }),
].join('\n')

function fakeChild(exited: Promise<number | null>, output = transcript) {
    return {
        stdin: { end: vi.fn() },
        stdout: Readable.from([output]),
        stderr: Readable.from([]),
        exited,
        kill: vi.fn(),
    } satisfies NpcAiProcess
}

it('waits for a cancelled child to exit before spawning replacements', async () => {
    const firstStarted = Promise.withResolvers<undefined>()
    const firstExit = Promise.withResolvers<number | null>()
    const first = fakeChild(firstExit.promise, '')
    const secondStarted = Promise.withResolvers<undefined>()
    const secondExit = Promise.withResolvers<number | null>()
    const second = fakeChild(secondExit.promise)
    let firstHasExited = false
    let secondHasExited = false

    const spawn = vi
        .fn<NpcAiSpawn>()
        .mockImplementationOnce(() => {
            firstStarted.resolve(undefined)
            return first
        })
        .mockImplementationOnce(() => {
            expect(firstHasExited).toBe(true)
            secondStarted.resolve(undefined)
            return second
        })
        .mockImplementationOnce(() => {
            expect(secondHasExited).toBe(true)
            return fakeChild(Promise.resolve(0))
        })
    const provider = new CodexCliProvider({ spawn, log: () => undefined })
    const decide = (signal = new AbortController().signal) =>
        provider.decide(context, defaultNpcAiSettings, signal)

    const firstController = new AbortController()
    const cancelled = expect(decide(firstController.signal)).rejects.toThrow(
        'cancelled'
    )
    await firstStarted.promise
    firstController.abort()
    await cancelled
    expect(first.kill).toHaveBeenCalledWith('SIGKILL')

    const queuedController = new AbortController()
    const skipped = expect(decide(queuedController.signal)).rejects.toThrow(
        'aborted in queue'
    )
    const answers = Promise.allSettled([decide(), decide()])
    queuedController.abort(new Error('aborted in queue'))
    await skipped
    await nextTurn()
    expect(spawn).toHaveBeenCalledTimes(1)

    firstHasExited = true
    firstExit.resolve(null)
    await secondStarted.promise
    await nextTurn()
    expect(spawn).toHaveBeenCalledTimes(2)
    secondHasExited = true
    secondExit.resolve(0)
    expect(await answers).toEqual([
        { status: 'fulfilled', value: reply },
        { status: 'fulfilled', value: reply },
    ])
    expect(spawn).toHaveBeenCalledTimes(3)
})
