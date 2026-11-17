import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { buildNpcAiObservation } from '../src/ai/observation'
import { projectSpeechFocus } from '../src/game/speechFocus'
import { controlledNpcProvider, npcRuntimeFixture } from './npcAiRuntimeFixture'

const fixtures: Array<ReturnType<typeof npcRuntimeFixture>> = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    for (const f of fixtures.splice(0)) {
        f.room.stop()
        await f.diagnostics.flush()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('passes an earned selected well as topic, independently from the selected conversation recipient', async () => {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    fixtures.push(f)
    const key = 'world:map-2-2:water:56:36'
    f.alice.actor.position = { x: 888, y: 584 }
    f.actor.position = { x: 872, y: 584 }
    const focus = projectSpeechFocus(f.room, f.alice.actor, key, Date.now())
    expect(focus).toMatchObject({
        key,
        name: 'Колодец',
        kind: 'world',
        details: { kind: 'water' },
    })
    f.alice.send({ type: 'chat', text: 'Это что?', focusKey: key })
    await f.advance()
    expect(provider.turns[0]?.context.events[0]).toMatchObject({
        kind: 'message',
        text: 'Это что?',
        focus: { name: 'Колодец' },
    })
    expect(provider.turns[0]?.context.observation.social).toBeUndefined()
    expect(
        buildNpcAiObservation(
            f.room,
            f.actor,
            'companion',
            Date.now()
        ).targets.find((target) => target.id === f.alice.actor.id)?.details
    ).toMatchObject({
        controllerKind: 'network_player',
        connected: true,
        canReceiveQuest: true,
    })
})

it('ignores a forged or unseen focus and never includes private inventory or distant objects', () => {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    fixtures.push(f)
    f.alice.actor.position = { x: 128, y: 128 }
    expect(
        projectSpeechFocus(f.room, f.alice.actor, 'world:invented', Date.now())
    ).toBeUndefined()
    expect(
        projectSpeechFocus(
            f.room,
            f.alice.actor,
            'world:map-2-2:water:56:36',
            Date.now()
        )
    ).toBeUndefined()
})
