import { expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { characterActions, followActions, socialActions } from './nearbyCharacterActions'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

it('hides AI companion orders while keeping self follow, whisper and exchange on the exact target', () => {
    const player = characterFixture('self')
    const npc = characterFixture('ai', {
        position: { x: 20, y: 0 },
        interactions: { aiDialogue: true, whisper: true, exchange: true },
        soul: {
            kind: 'echo',
            controlSource: 'script',
            personality: '',
            canSpeak: true,
            companion: { canFight: false, lastReply: null, leaderId: player.id, order: 'follow' },
        },
    })
    expect(
        characterActions([npc], player).some(
            (action) => action.command.type === 'companion_request'
        )
    ).toBe(false)
    expect(followActions([npc], player).map((action) => action.command)).toEqual([
        { type: 'follow', targetId: npc.id },
    ])
    expect(socialActions([npc], player).map((action) => action.command)).toEqual([
        { type: 'whisper_open', targetId: npc.id },
        { type: 'exchange_invite', targetId: npc.id },
    ])
    const other = characterFixture('other', {
        position: { x: 10, y: 0 },
        interactions: { aiDialogue: false, whisper: true, exchange: true },
    })
    const snapshot = worldFixture([player, other, npc])
    expect(
        nearbyInteractionTarget(
            snapshot,
            player,
            snapshot.characters,
            () => true,
            `character:${npc.id}`,
            true
        )?.actions.find((action) => action.id === `exchange:${npc.id}`)?.command
    ).toEqual({ type: 'exchange_invite', targetId: npc.id })
    expect(socialActions([{ ...npc, position: { x: 49, y: 0 } }], player)).toEqual([])
})
