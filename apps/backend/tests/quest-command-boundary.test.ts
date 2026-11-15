import { describe, expect, it } from 'vitest'

import { parseClientMessage } from '../src/game/messages'

const parse = (command: unknown) => parseClientMessage(JSON.stringify(command))

describe('quest command validation', () => {
    it.each(['submitter', 'party_equal'])(
        'accepts %s only while selecting a new quest',
        (rewardMode) => {
            expect(
                parse({
                    type: 'dialogue_choice',
                    choiceId: 'accept_quest',
                    rewardMode,
                }).message
            ).toEqual({
                type: 'dialogue_choice',
                choiceId: 'accept_quest',
                rewardMode,
            })
            expect(
                parse({
                    type: 'dialogue_choice',
                    choiceId: 'turn_in_trophies',
                    rewardMode,
                }).message
            ).toBeUndefined()
            expect(
                parse({
                    type: 'guild_accept',
                    questId: 'worker-request-1',
                    rewardMode,
                }).message
            ).toEqual({
                type: 'guild_accept',
                questId: 'worker-request-1',
                rewardMode,
            })
        }
    )

    it.each(['guild_report', 'guild_turn_in', 'guild_abandon'])(
        'requires a specific instance for %s',
        (type) => {
            expect(parse({ type }).message).toBeUndefined()
            expect(parse({ type, instanceId: '' }).message).toBeUndefined()
            expect(
                parse({ type, instanceId: 'guild-contract-1' }).message
            ).toEqual({ type, instanceId: 'guild-contract-1' })
        }
    )

    it('rejects unknown reward modes', () => {
        expect(
            parse({
                type: 'dialogue_choice',
                choiceId: 'accept_quest',
                rewardMode: 'mint_everyone',
            }).message
        ).toBeUndefined()
        expect(
            parse({
                type: 'guild_accept',
                questId: 'slime_hunt',
                rewardMode: 'mint_everyone',
            }).message
        ).toBeUndefined()
    })
})
