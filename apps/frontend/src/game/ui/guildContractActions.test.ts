import type { PartySnapshot } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { guildQuestFixture, workRequestFixture } from '../testing/questFixture'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

function fixture() {
    const player = characterFixture('player', { facing: 'right' })
    const clerk = characterFixture('clerk', {
        position: { x: 24, y: 0 },
        controllerKind: 'scripted',
    })
    const neighbor = characterFixture('neighbor', {
        position: { x: 28, y: 0 },
        controllerKind: 'scripted',
    })
    const jobs = [
        guildQuestFixture(),
        guildQuestFixture({ id: 'skeleton_hunt', title: 'Кости старого тракта' }),
        guildQuestFixture({ id: 'work-request-1', workRequest: workRequestFixture() }),
    ]
    const party: PartySnapshot = {
        activeJob: null,
        guildContact: { npcId: clerk.id, nickname: clerk.nickname },
        invitations: [],
        jobs,
        leaderId: null,
        members: [],
        notice: null,
        partyId: null,
    }
    const characters = [player, clerk, neighbor]
    const snapshot = { ...worldFixture(characters), party }
    const offers = (target = clerk, visible = true) =>
        nearbyInteractionTarget(
            snapshot,
            player,
            characters,
            () => visible,
            `character:${target.id}`
        )?.actions.filter((action) => action.command.type === 'guild_accept') ?? []
    return { clerk, neighbor, offers, party, player }
}

it('offers static guild jobs with explicit reward choices only at the visible local contact', () => {
    const { clerk, neighbor, offers, party } = fixture()
    expect(offers()).toMatchObject([
        {
            label: 'Взять «Зачистка троп» · 30 ◈ · Поровну группе',
            command: { questId: 'slime_hunt', rewardMode: 'party_equal' },
        },
        {
            label: 'Взять «Зачистка троп» · 30 ◈ · Вся награда сдающему',
            command: { questId: 'slime_hunt', rewardMode: 'submitter' },
        },
        { command: { questId: 'skeleton_hunt', rewardMode: 'party_equal' } },
        { command: { questId: 'skeleton_hunt', rewardMode: 'submitter' } },
    ])
    expect(offers(neighbor)).toEqual([])
    expect(offers(clerk, false)).toEqual([])

    party.guildContact = null
    expect(offers()).toEqual([])
})

it('offers contracts only to an eligible leader and skips the latest completed contract', () => {
    const { offers, party, player } = fixture()
    party.leaderId = 'another-leader'
    expect(offers()).toEqual([])

    party.leaderId = player.id
    party.activeJob = guildQuestFixture({ status: 'ready' })
    expect(offers()).toEqual([])

    party.activeJob = guildQuestFixture({ status: 'completed' })
    expect(offers()).toMatchObject([
        { command: { questId: 'skeleton_hunt', rewardMode: 'party_equal' } },
        { command: { questId: 'skeleton_hunt', rewardMode: 'submitter' } },
    ])
})
