import { describe, expect, it } from 'vitest'

import { evaluateAssistancePolicy } from '../src/game/assistancePolicy'
import { GameCharacter } from '../src/game/character'
import { setCharacterControlSource } from '../src/game/characterSoul'
import { companionSoul } from '../src/game/companionProfiles'
import { CompanionService } from '../src/game/companions'

function character(id: string, player = false): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        faction: 'peaceful',
        controllerKind: player ? 'network_player' : 'scripted',
        spawnPosition: { x: 80, y: 80 },
        ...(player ? {} : { soul: companionSoul(id) }),
    })
}

describe('authored assistance conditions', () => {
    it('evaluates bounded typed all/any conditions and requires actual completed quest facts', () => {
        const facts = {
            met: false,
            questCompleted: (id: string) => id === 'finished',
        }
        expect(evaluateAssistancePolicy({ kind: 'always' }, facts)).toBe(true)
        expect(evaluateAssistancePolicy({ kind: 'never' }, facts)).toBe(false)
        expect(
            evaluateAssistancePolicy({ kind: 'all', conditions: [] }, facts)
        ).toBe(false)
        expect(
            evaluateAssistancePolicy({ kind: 'any', conditions: [] }, facts)
        ).toBe(false)
        expect(
            evaluateAssistancePolicy(
                {
                    kind: 'all',
                    conditions: [
                        { kind: 'met' },
                        { kind: 'quest_completed', questId: 'finished' },
                    ],
                },
                facts
            )
        ).toBe(false)
        expect(
            evaluateAssistancePolicy(
                {
                    kind: 'any',
                    conditions: [
                        { kind: 'met' },
                        { kind: 'quest_completed', questId: 'finished' },
                    ],
                },
                facts
            )
        ).toBe(true)
        expect(
            evaluateAssistancePolicy(
                { kind: 'quest_completed', questId: 'unfinished' },
                facts
            )
        ).toBe(false)
    })

    it('reserves a willing helper only after meeting and prevents another player from taking consent', () => {
        const service = new CompanionService()
        const actor = character('hero', true),
            other = character('stranger', true),
            helper = character('npc_wanderer_1')
        const context = {
            questCompleted: () => false,
            hasLineOfSight: () => true,
        }
        expect(service.canAssist(actor, helper, context, 5000).accepted).toBe(
            false
        )
        service.rememberMeeting(actor, helper)
        expect(
            service.claimAssistance(actor, helper, context, 5000).accepted
        ).toBe(true)
        expect(service.hasConsent(actor.id, helper)).toBe(true)
        service.rememberMeeting(other, helper)
        expect(
            service.claimAssistance(other, helper, context, 5000).accepted
        ).toBe(false)
        expect(service.releaseAssistance(other.id, helper)).toBe(false)
        expect(service.releaseAssistance(actor.id, helper)).toBe(true)
        expect(
            service.claimAssistance(other, helper, context, 5000).accepted
        ).toBe(true)
    })

    it('does not replace the story condition with a conversation or a different quest', () => {
        const service = new CompanionService(),
            actor = character('hero', true),
            helper = character('npc_wanderer_2')
        service.rememberMeeting(actor, helper)
        expect(
            service.canAssist(
                actor,
                helper,
                { questCompleted: () => false, hasLineOfSight: () => true },
                5000
            ).accepted
        ).toBe(false)
        expect(
            service.canAssist(
                actor,
                helper,
                {
                    questCompleted: (actorId, id) =>
                        actorId === actor.id &&
                        id === 'hearts-for-the-border-bell',
                    hasLineOfSight: () => true,
                },
                5000
            ).accepted
        ).toBe(true)
    })
})

describe('assistance availability and ownership', () => {
    it.each([
        'distance',
        'sight',
        'dead',
        'retired',
        'leased',
        'human_owner',
        'requester_disconnected',
        'requester_echo',
    ])('rejects unavailable assistance: %s', (reason) => {
        const service = new CompanionService(),
            actor = character('hero', true),
            helper = character(
                reason === 'human_owner' ? 'other-player' : 'npc_veteran_1',
                reason === 'human_owner'
            )
        if (reason === 'distance') {
            helper.position.x += 65
        }
        if (reason === 'dead') {
            helper.alive = false
        }
        if (reason === 'retired') {
            helper.tags.add('state.retired')
        }
        if (reason === 'leased') {
            setCharacterControlSource(helper, 'model')
        }
        if (reason === 'requester_disconnected') {
            actor.connected = false
        }
        if (reason === 'requester_echo') {
            setCharacterControlSource(actor, 'script')
        }
        expect(
            service.claimAssistance(
                actor,
                helper,
                {
                    questCompleted: () => true,
                    hasLineOfSight: () => reason !== 'sight',
                },
                5000
            ).accepted
        ).toBe(false)
        expect(service.hasConsent(actor.id, helper)).toBe(false)
    })
})
