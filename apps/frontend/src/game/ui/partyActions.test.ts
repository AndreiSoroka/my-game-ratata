import type { PartySnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { invitationActions } from './partyActions'
describe('pending party invitation eligibility', () => {
    it('offers answer instead of reverse invite, and never reinvites a current member', () => {
        const player = characterFixture('self'),
            target = characterFixture('leader')
        const party: PartySnapshot = {
            partyId: null,
            leaderId: null,
            members: [],
            jobs: [],
            activeJob: null,
            notice: null,
            invitations: [
                {
                    id: 'invite',
                    fromId: target.id,
                    toId: player.id,
                    fromName: 'Лидер',
                    toName: 'Я',
                    expiresAt: 30000,
                },
            ],
        }
        expect(
            invitationActions(player, target, party).map((action) => action.command.type)
        ).toEqual(['party_answer', 'party_answer'])
        party.members = [
            {
                id: target.id,
                nickname: 'Лидер',
                alive: true,
                online: true,
                hpPercent: 75,
                locationId: 'map-2-2',
            },
        ]
        expect(invitationActions(player, target, party)).toEqual([])
    })
})
