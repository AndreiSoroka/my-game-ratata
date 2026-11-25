import type { PartySnapshot } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { guildQuestFixture, workRequestFixture } from '../testing/questFixture'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

it('lets players whisper to Mira or open city affairs from her menu', () => {
    const player = characterFixture('player', { facing: 'right' })
    const clerk = characterFixture('npc_friendly_girl_1', {
        nickname: 'Mira',
        position: { x: 24, y: 0 },
        controllerKind: 'scripted',
        interactions: {
            whisper: true,
            dialogueMode: 'scripted',
            aiDialogue: false,
            exchange: false,
        },
    })
    const party: PartySnapshot = {
        activeJobs: [],
        guildContact: { npcId: clerk.id, nickname: clerk.nickname },
        invitations: [],
        jobs: [
            guildQuestFixture(),
            guildQuestFixture({ id: 'work-request-1', workRequest: workRequestFixture() }),
        ],
        leaderId: null,
        members: [],
        notice: null,
        partyId: null,
    }
    const characters = [player, clerk]
    const snapshot = { ...worldFixture(characters), party }
    const actions = nearbyInteractionTarget(
        snapshot,
        player,
        characters,
        () => true,
        `character:${clerk.id}`
    )?.actions.map(({ command }) => command)
    expect(actions).toContainEqual({ type: 'whisper_open', targetId: clerk.id })
    expect(actions).toContainEqual({
        type: 'interact',
        targetId: clerk.id,
        service: 'city_affairs',
    })
    expect(actions?.some(({ type }) => type === 'guild_accept')).toBe(false)
    expect(actions).not.toContainEqual({
        type: 'interact',
        targetId: clerk.id,
        service: 'worker_requests',
    })
})
