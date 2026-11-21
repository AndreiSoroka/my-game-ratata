import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { combatEffectCues, eventCaption } from './combatEffectPlan'
import { SPARK_COLOR } from './effectGraphics'

vi.mock('excalibur', () => ({ Canvas: class {} }))

describe('authoritative combat presentation', () => {
    it('renders learned shot and spark independently of starting class, at their real windup', () => {
        const warrior = characterFixture('warrior', { basicAttackKind: 'melee' })
        const shot = combatEffectCues(
            { kind: 'attack', abilityId: 'shot', actorId: warrior.id, targetId: 'victim' },
            warrior
        )
        expect(shot[0]).toMatchObject({
            kind: 'arrow',
            targetId: 'victim',
            travel: true,
            duration: ABILITY_DEFINITIONS.shot.windupMs,
        })
        const spark = combatEffectCues(
            { kind: 'attack', abilityId: 'spark', actorId: warrior.id, targetId: 'victim' },
            warrior
        )
        expect(spark[0]).toMatchObject({
            kind: 'spark',
            color: SPARK_COLOR,
            duration: ABILITY_DEFINITIONS.spark.windupMs,
        })
    })
    it('creates a prayer wave and individual impact only after a positive authoritative hit or absorption', () => {
        const actor = characterFixture('priest')
        expect(
            combatEffectCues({ kind: 'cast', abilityId: 'pray', phase: 'completed' }, actor).map(
                (cue) => cue.kind
            )
        ).toEqual(['devotion'])
        expect(
            combatEffectCues(
                { kind: 'damage', abilityId: 'pray', targetId: 'victim', amount: 0 },
                actor
            )
        ).toEqual([])
        const hit = combatEffectCues(
            { kind: 'damage', abilityId: 'pray', targetId: 'victim', amount: 5 },
            actor
        )
        expect(hit.map((cue) => [cue.kind, cue.targetId])).toEqual([
            ['wave', actor.id],
            ['prayer_hit', 'victim'],
        ])
        const absorbed = combatEffectCues(
            { kind: 'absorb', abilityId: 'pray', targetId: 'protected', amount: 5 },
            actor
        )
        expect(absorbed.map((cue) => cue.targetId)).toEqual(['protected', actor.id, 'protected'])
    })
    it.each([undefined, 'ally'])(
        'keeps a completed prayer to %s cosmetic and on the caster',
        (targetId) => {
            const actor = characterFixture('priest')
            const event = { kind: 'cast', abilityId: 'pray', phase: 'completed', targetId } as const
            expect(combatEffectCues(event, actor)).toEqual([
                {
                    kind: 'devotion',
                    fromId: actor.id,
                    targetId: actor.id,
                    deity: 'hearth',
                    color: '#f9d37b',
                    duration: 600,
                    count: 4,
                },
            ])
            expect(eventCaption(event)).toBe('Молитва')
        }
    )
    it('keeps channel actor distinct from the body and labels resource and preparation states', () => {
        const actor = characterFixture('priest')
        const [channel] = combatEffectCues(
            { kind: 'cast', abilityId: 'pray', phase: 'started', targetId: 'body' },
            actor
        )
        expect(channel).toMatchObject({
            fromId: actor.id,
            targetId: 'body',
            channel: true,
            duration: 3000,
        })
        expect(eventCaption({ kind: 'heal', text: 'energy', amount: 7 })).toBe('Энергия +7')
        expect(eventCaption({ kind: 'heal', text: 'mana', amount: 8 })).toBe('Мана +8')
        expect(eventCaption({ kind: 'cast', phase: 'started', abilityId: 'skeleton_strike' })).toBe(
            'Костяной удар…'
        )
        expect(eventCaption({ kind: 'cast', phase: 'interrupted' })).toBe('Прервано')
    })
    it('fades a refusal mark only for an authoritative failed prayer notice', () => {
        const actor = characterFixture('priest')
        expect(
            combatEffectCues(
                {
                    kind: 'notice',
                    noticeKind: 'prayer_unanswered',
                    abilityId: 'pray',
                    text: 'Божество не ответило',
                    actorId: actor.id,
                },
                actor
            )[0]
        ).toMatchObject({ kind: 'refused', count: 0, targetId: actor.id })
        expect(
            combatEffectCues(
                { kind: 'notice', abilityId: 'pray', text: 'Обычное уведомление' },
                actor
            )
        ).toEqual([])
    })
})

it('uses the resolved prayer radius for cosmetic waves without changing their budget', () => {
    const actor = characterFixture('priest', {
        abilities: {
            known: ['pray'],
            cooldowns: {},
            casting: null,
            barrier: null,
            prayer: { radius: 96, durationMs: 2700, manaCost: 5, area: true, harm: true },
        },
    })
    const cues = combatEffectCues({ kind: 'damage', abilityId: 'pray', targetId: 'victim' }, actor)
    expect(cues[0]).toMatchObject({ kind: 'wave', radius: 96, count: 12 })
})
