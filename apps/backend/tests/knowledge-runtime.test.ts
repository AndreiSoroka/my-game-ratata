import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { CharacterKnowledge } from '../src/ai/characterKnowledge'
import type { NpcAiContext } from '../src/ai/types'
import { npcReply, npcRuntimeFixture } from './npcAiRuntimeFixture'

let fixture: ReturnType<typeof npcRuntimeFixture> | undefined

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})

afterEach(async () => {
    fixture?.room.stop()
    await fixture?.diagnostics.flush()
    fixture = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

it('supplies authorized whole articles only after the actual Spark chooses to search', async () => {
    const contexts: NpcAiContext[] = []
    const leaseKinds: string[] = []
    fixture = npcRuntimeFixture((context) => {
        contexts.push(context)
        leaseKinds.push(fixture?.actor.soul.kind ?? 'missing')
        return Promise.resolve(
            context.knowledge === undefined
                ? npcReply(null, {
                      informationRequest: {
                          type: 'knowledge_search',
                          query: 'срубить дерево топор меч пень',
                      },
                  })
                : npcReply(null, { speech: 'Нужен топор или меч.' })
        )
    })
    fixture.talk('Хочу срубить дерево')
    await fixture.advance(1500)

    expect(contexts).toHaveLength(2)
    expect(contexts[0]?.knowledge).toBeUndefined()
    expect(contexts[0]?.knowledgeScope).toMatchObject({
        canSearch: true,
        lookupsRemaining: 1,
    })
    expect(JSON.stringify(contexts[0]?.knowledgeScope)).not.toMatch(
        /forestry\.|person\.|knowledge\/|8 древесины/
    )
    const context = contexts[1]
    expect(context?.actorId).toBe(fixture.actor.id)
    expect(leaseKinds).toContain('spark')
    expect(context?.knowledge?.query).toBe('срубить дерево топор меч пень')
    expect(context?.knowledgeScope).toMatchObject({
        canSearch: false,
        lookupsRemaining: 0,
    })
    const entries = context?.knowledge?.entries ?? []
    const chopping = entries.find((entry) => entry.id === 'forestry.chopping')
    expect(chopping?.text).toContain('топором или мечом')
    expect(chopping?.text).toContain('пень')
    expect(
        entries.some((entry) => entry.id === 'forestry.chopping.expert')
    ).toBe(false)
    expect(entries.some((entry) => entry.id === 'equipment.tools.expert')).toBe(
        false
    )
    expect(JSON.stringify(entries)).not.toMatch(
        /knowledge\/|audiences|aliases|checks|sources|facts/
    )
    expect(entries.length).toBeLessThanOrEqual(6)
    expect(
        entries.reduce((sum, entry) => sum + entry.text.length, 0)
    ).toBeLessThanOrEqual(4000)
})

it('answers a greeting in one model call without invoking retrieval', async () => {
    const retrieve = vi.spyOn(CharacterKnowledge.prototype, 'retrieve')
    const contexts: NpcAiContext[] = []
    fixture = npcRuntimeFixture((context) => {
        contexts.push(context)
        return Promise.resolve(npcReply(null, { speech: 'Привет!' }))
    })
    fixture.talk('Привет')
    await fixture.advance(1500)
    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.knowledge).toBeUndefined()
    expect(contexts[0]?.knowledgeScope?.topics).toContain('Лес и древесина')
    expect(retrieve).not.toHaveBeenCalled()
})

it('advertises no lookup when the actual shared call budget has no second call left', async () => {
    const contexts: NpcAiContext[] = []
    fixture = npcRuntimeFixture(
        (context) => {
            contexts.push(context)
            return Promise.resolve(
                npcReply(null, { speech: 'Сейчас не припомню.' })
            )
        },
        { maxCallsPerHour: 1 }
    )
    fixture.talk('Хочу срубить дерево')
    await fixture.advance(1500)
    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.knowledgeScope).toMatchObject({
        canSearch: false,
        lookupsRemaining: 0,
    })
})
