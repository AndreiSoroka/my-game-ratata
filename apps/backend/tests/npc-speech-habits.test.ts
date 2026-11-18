import { expect, it } from 'vitest'

import { npcIdentityContext } from '../src/ai/npcIdentityInstructions'
import { npcIdentityDefinitions } from '../src/game/npcIdentityCatalog'
import {
    generateNpcIdentityProfile,
    validateNpcIdentityDefinition,
} from '../src/game/npcIdentityProfiles'

const id = 'authored-speaking-creature'
function profile() {
    return generateNpcIdentityProfile('habits', id, 'kaplya')
}

it('keeps habits private, immutable and detached from the authoring arrays', () => {
    const authored = npcIdentityDefinitions.kaplya.speechHabits
    if (authored?.interjection === undefined) {
        throw new Error('Missing authored interjection habit')
    }
    const guidance = [...authored.guidance]
    const variants = [...authored.interjection.variants]
    const selected = generateNpcIdentityProfile('habits', id, 'kaplya', {
        ...npcIdentityDefinitions.kaplya,
        speechHabits: {
            guidance,
            interjection: {
                variants,
                positions: [...authored.interjection.positions],
            },
        },
    })
    expect(Object.isFrozen(selected.speechHabits)).toBe(true)
    expect(Object.isFrozen(selected.speechHabits?.guidance)).toBe(true)
    expect(Object.isFrozen(selected.speechHabits?.interjection)).toBe(true)
    expect(Object.isFrozen(selected.speechHabits?.interjection?.variants)).toBe(
        true
    )
    expect(
        Object.isFrozen(selected.speechHabits?.interjection?.positions)
    ).toBe(true)
    guidance.push('New author text after identity creation')
    variants.push('new-sound')
    expect(selected.speechHabits?.guidance).toEqual(authored.guidance)
    expect(selected.speechHabits?.interjection?.variants).toEqual(
        authored.interjection.variants
    )
})

it('selects stable per-turn cues with varied positions and sounds without changing the biography', () => {
    const actor = { npcIdentityProfile: profile() }
    const expectedStory = actor.npcIdentityProfile.backstory
    const positions = new Set<string>()
    const variants = new Set<string>()
    for (let index = 0; index < 64; index++) {
        const turn = {
            actorId: id,
            turnId: `message-${String(index)}`,
            step: 0,
        }
        const first = npcIdentityContext(actor, turn)
        const repeated = npcIdentityContext(actor, turn)
        expect(repeated).toEqual(first)
        const cue = first?.speechHabits?.interjection
        if (
            cue?.preferredPosition === undefined ||
            cue.preferredVariant === undefined
        ) {
            throw new Error('Missing per-turn interjection cue')
        }
        expect(cue.positions).toContain(cue.preferredPosition)
        expect(cue.variants).toContain(cue.preferredVariant)
        positions.add(cue.preferredPosition)
        variants.add(cue.preferredVariant)
        expect(actor.npcIdentityProfile.backstory).toBe(expectedStory)
    }
    expect([...positions].sort()).toEqual(['end', 'middle', 'start'])
    expect([...variants].sort()).toEqual(['буль', 'буль-буль'])
})

it('uses authored habits rather than a name or NPC-specific controller branch', () => {
    const original = generateNpcIdentityProfile(
        'habits',
        'another-actor',
        'mira'
    )
    expect(
        npcIdentityContext({ npcIdentityProfile: original })?.speechHabits
    ).toBeUndefined()
    const habits = npcIdentityDefinitions.kaplya.speechHabits
    if (habits === undefined) {
        throw new Error('Missing authored habits')
    }
    const customized = generateNpcIdentityProfile(
        'habits',
        'another-actor',
        'mira',
        {
            ...npcIdentityDefinitions.mira,
            speechHabits: habits,
        }
    )
    const context = npcIdentityContext(
        { npcIdentityProfile: customized },
        {
            actorId: 'another-actor',
            turnId: 'ordinary-message',
            step: 1,
        }
    )
    expect(context?.speechHabits?.guidance).toEqual(habits.guidance)
    expect(context?.speechHabits?.interjection?.preferredVariant).toBeDefined()
    expect(customized.backstory).toEqual(original.backstory)
    expect(customized.gender).toBe(original.gender)
    expect(customized.selfReference).toBe(original.selfReference)
})

it('rejects empty or ambiguous authored speech-habit data', () => {
    const definition = npcIdentityDefinitions.kaplya
    for (const speechHabits of [
        { guidance: [] },
        { guidance: [''] },
        {
            guidance: ['Talk naturally'],
            interjection: { variants: [], positions: ['start' as const] },
        },
        {
            guidance: ['Talk naturally'],
            interjection: {
                variants: ['буль', 'буль'],
                positions: ['start' as const],
            },
        },
        {
            guidance: ['Talk naturally'],
            interjection: { variants: ['буль'], positions: [] },
        },
    ]) {
        expect(() =>
            validateNpcIdentityDefinition({ ...definition, speechHabits })
        ).toThrow()
    }
})
