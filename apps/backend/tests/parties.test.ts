import type {
    GameEventPayload,
    PartyClientMessage,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { PartyService } from '../src/game/parties'

describe('adventurer party consent and lifecycle', () => {
    it('requires the intended recipient to accept, expires invites, and permits refusal', () => {
        const setup = scenario()
        const [leader, member, stranger] = setup.players
        if (
            leader === undefined ||
            member === undefined ||
            stranger === undefined
        ) {
            throw new Error('Missing roster')
        }
        setup.command(leader, { targetId: member.id, type: 'party_invite' })
        const invitation = setup.party.snapshot(member.id).invitations[0]
        if (invitation === undefined) {
            throw new Error('Missing invitation')
        }
        setup.command(stranger, {
            accept: true,
            invitationId: invitation.id,
            type: 'party_answer',
        })
        expect(setup.party.snapshot(member.id).partyId).toBeNull()
        setup.command(member, {
            accept: false,
            invitationId: invitation.id,
            type: 'party_answer',
        })
        expect(setup.party.snapshot(member.id).partyId).toBeNull()
        setup.command(leader, { targetId: member.id, type: 'party_invite' })
        setup.party.update(setup.characters, 40_001)
        expect(setup.party.snapshot(member.id).invitations).toEqual([])
        expect(setup.party.snapshot(member.id).partyId).toBeNull()
    })

    it('limits membership to four and reserves invitations for the leader', () => {
        const setup = scenario(5)
        const leader = setup.first()
        for (const member of setup.players.slice(1, 4)) {
            setup.join(leader, member)
        }
        expect(setup.party.snapshot(leader.id).members).toHaveLength(4)
        const fifth = setup.players[4]
        const member = setup.players[1]
        if (fifth === undefined || member === undefined) {
            throw new Error('Missing roster')
        }
        setup.command(leader, { targetId: fifth.id, type: 'party_invite' })
        setup.command(member, { targetId: fifth.id, type: 'party_invite' })
        expect(setup.party.snapshot(fifth.id).invitations).toEqual([])
    })

    it('keeps downed friends for rescue, removes offline/permadead members, and transfers leadership', () => {
        const setup = scenario()
        const leader = setup.first()
        const member = setup.players[1]
        const offline = setup.players[2]
        if (member === undefined || offline === undefined) {
            throw new Error('Missing roster')
        }
        setup.join(leader, member)
        setup.join(leader, offline)
        member.applyDamage(member.hp, 10_000)
        offline.tags.add('offline')
        setup.party.update(setup.characters, 10_100)
        expect(
            setup.party.snapshot(leader.id).members.map((entry) => entry.id)
        ).toEqual([leader.id, member.id])
        setup.party.observe(
            [{ actorId: leader.id, kind: 'permadeath' }],
            setup.find
        )
        expect(setup.party.snapshot(member.id).leaderId).toBe(member.id)
        expect(setup.party.snapshot(leader.id).partyId).toBeNull()
    })

    it.each(['far', 'different-location', 'offline', 'npc'] as const)(
        'rejects unavailable invite targets: %s',
        (reason) => {
            const setup = scenario()
            const leader = setup.first()
            const target = setup.players[1]
            if (target === undefined) {
                throw new Error('Missing target')
            }
            if (reason === 'far') {
                target.position.x += 241
            }
            if (reason === 'different-location') {
                target.locationId = 'map-0-0'
            }
            if (reason === 'offline') {
                target.tags.add('offline')
            }
            setup.command(leader, {
                targetId: reason === 'npc' ? setup.contact.id : target.id,
                type: 'party_invite',
            })
            expect(setup.party.snapshot(target.id).invitations).toEqual([])
        }
    )
})

describe('guild abandonment authority', () => {
    it('allows the living connected leader to abandon away from an unavailable clerk', () => {
        const setup = scenario(2)
        const leader = setup.first()
        const member = setup.players[1]
        if (member === undefined) {
            throw new Error('Missing member')
        }
        setup.join(leader, member)
        setup.command(leader, { type: 'guild_accept', questId: 'slime_hunt' })
        const instanceId =
            setup.party.snapshot(leader.id).activeJob?.instanceId ?? 'missing'
        leader.position.x += 500
        setup.contact.alive = false
        setup.command(leader, { type: 'guild_abandon', instanceId })
        expect(setup.party.snapshot(leader.id).activeJob).toBeNull()
        expect(setup.party.snapshot(member.id).activeJob).toBeNull()
        expect(setup.gold.snapshot(leader.id).gold).toBe(0)
    })

    it('rejects stale, foreign, nonleader and dead-actor abandonment requests', () => {
        const setup = scenario(3)
        const leader = setup.first()
        const member = setup.players[1]
        const stranger = setup.players[2]
        if (member === undefined || stranger === undefined) {
            throw new Error('Missing players')
        }
        setup.join(leader, member)
        setup.command(leader, { type: 'guild_accept', questId: 'slime_hunt' })
        const instanceId =
            setup.party.snapshot(leader.id).activeJob?.instanceId ?? 'missing'
        leader.position.x += 500
        setup.command(leader, { type: 'guild_abandon', instanceId: 'obsolete' })
        setup.command(member, { type: 'guild_abandon', instanceId })
        setup.command(stranger, { type: 'guild_abandon', instanceId })
        leader.applyDamage(leader.hp, 10_000)
        setup.command(leader, { type: 'guild_abandon', instanceId })
        expect(setup.party.snapshot(member.id).activeJob).toMatchObject({
            instanceId,
            status: 'active',
        })
        expect(setup.gold.snapshot(leader.id).gold).toBe(0)
    })
})

describe('guild reward choices', () => {
    it('locks submitter mode and rejects stale instance IDs without changing the current contract', () => {
        const setup = scenario(2)
        const leader = setup.first()
        const member = setup.players[1]
        if (member === undefined) {
            throw new Error('Missing member')
        }
        setup.join(leader, member)
        setup.command(leader, {
            type: 'guild_accept',
            questId: 'slime_hunt',
            rewardMode: 'submitter',
        })
        setup.command(leader, {
            type: 'guild_accept',
            questId: 'slime_hunt',
            rewardMode: 'party_equal',
        })
        for (let index = 0; index < 3; index += 1) {
            setup.kill(leader, 'slime', `proof-${String(index)}`)
        }
        setup.command(leader, { type: 'guild_turn_in', instanceId: 'obsolete' })
        expect(setup.gold.snapshot(leader.id).gold).toBe(0)
        expect(setup.party.snapshot(leader.id).activeJob?.rewardMode).toBe(
            'submitter'
        )
        setup.turnIn(leader)
        expect(setup.gold.snapshot(leader.id).gold).toBe(30)
        expect(setup.gold.snapshot(member.id).gold).toBe(0)
    })

    it('lets someone paid a share later accept their own instance of the same static quest', () => {
        const setup = scenario(2)
        const leader = setup.first()
        const member = setup.players[1]
        if (member === undefined) {
            throw new Error('Missing member')
        }
        setup.join(leader, member)
        setup.command(leader, { type: 'guild_accept', questId: 'slime_hunt' })
        for (let index = 0; index < 3; index += 1) {
            setup.kill(leader, 'slime', `proof-${String(index)}`)
        }
        setup.turnIn(leader)
        expect(setup.gold.snapshot(member.id).gold).toBe(15)
        setup.command(member, { type: 'party_leave' })
        setup.command(member, { type: 'guild_accept', questId: 'slime_hunt' })
        expect(setup.party.snapshot(member.id).activeJob?.status).toBe('active')
    })
})

describe('shared guild contracts', () => {
    it('credits nearby living participants once and splits one budget across the current roster once', () => {
        const setup = scenario(4)
        const leader = setup.first()
        const [member, remote, downed] = setup.players.slice(1)
        if (
            member === undefined ||
            remote === undefined ||
            downed === undefined
        ) {
            throw new Error('Missing roster')
        }
        for (const player of [member, remote, downed]) {
            setup.join(leader, player)
        }
        setup.command(leader, { questId: 'slime_hunt', type: 'guild_accept' })
        remote.position.x += 500
        downed.applyDamage(downed.hp, 10_000)
        for (let index = 0; index < 3; index += 1) {
            setup.kill(leader, 'slime', `slime-${String(index)}`, true)
        }
        const job = setup.party.snapshot(leader.id).activeJob
        expect(job).toMatchObject({ progress: 3, status: 'ready' })
        expect(
            job?.participants.find((entry) => entry.id === member.id)
                ?.contribution
        ).toBe(3)
        expect(
            job?.participants.find((entry) => entry.id === remote.id)
                ?.contribution
        ).toBe(0)
        expect(
            job?.participants.find((entry) => entry.id === downed.id)
                ?.contribution
        ).toBe(0)
        setup.turnIn(leader)
        setup.turnIn(leader)
        expect(setup.gold.snapshot(leader.id).gold).toBe(8)
        expect(setup.gold.snapshot(member.id).gold).toBe(8)
        expect(setup.gold.snapshot(remote.id).gold).toBe(7)
        expect(setup.gold.snapshot(downed.id).gold).toBe(7)
        setup.command(leader, { questId: 'slime_hunt', type: 'guild_accept' })
        expect(setup.party.snapshot(leader.id).activeJob?.status).toBe(
            'completed'
        )
    })

    it('includes late helpers without contribution and excludes members who left', () => {
        const setup = scenario()
        const leader = setup.first()
        const original = setup.players[1]
        const late = setup.players[2]
        if (original === undefined || late === undefined) {
            throw new Error('Missing roster')
        }
        setup.join(leader, original)
        setup.command(leader, {
            questId: 'skeleton_hunt',
            type: 'guild_accept',
        })
        setup.join(leader, late)
        setup.kill(late, 'skeleton', 'one')
        setup.command(original, { type: 'party_leave' })
        setup.kill(leader, 'skeleton', 'two')
        setup.turnIn(leader)
        expect(setup.gold.snapshot(leader.id).gold).toBe(20)
        expect(setup.gold.snapshot(original.id).gold).toBe(0)
        expect(setup.gold.snapshot(late.id).gold).toBe(20)
        expect(
            setup.party
                .snapshot(leader.id)
                .activeJob?.participants.find((entry) => entry.id === late.id)
                ?.eligible
        ).toBe(true)
    })

    it('credits a consenting NPC companion only through a nearby living owner', () => {
        const setup = scenario()
        const leader = setup.first()
        const companion = new GameCharacter({
            archetype: 'human',
            controllerKind: 'scripted',
            faction: 'peaceful',
            id: 'companion',
            nickname: 'Companion',
            spawnPosition: { x: 80, y: 80 },
        })
        companion.soul.companion = {
            canFight: true,
            lastReply: null,
            leaderId: leader.id,
            order: 'help',
        }
        setup.characters.push(companion)
        setup.command(leader, { questId: 'slime_hunt', type: 'guild_accept' })
        setup.kill(companion, 'slime', 'earned')
        leader.position.x += 500
        setup.kill(companion, 'slime', 'remote')
        expect(setup.party.snapshot(leader.id).activeJob?.progress).toBe(1)
    })
})

describe('guild exploration and contacts', () => {
    it('requires actual exploration but splits the budget with the current roster', () => {
        const setup = scenario()
        const leader = setup.first()
        const explorer = setup.players[1]
        const camper = setup.players[2]
        if (explorer === undefined || camper === undefined) {
            throw new Error('Missing roster')
        }
        setup.join(leader, explorer)
        setup.join(leader, camper)
        setup.command(leader, {
            questId: 'survey_frontier',
            type: 'guild_accept',
        })
        setup.party.update(setup.characters, 10_100)
        expect(setup.party.snapshot(leader.id).activeJob?.progress).toBe(0)
        explorer.locationId = 'map-1-1'
        setup.party.update(setup.characters, 10_200)
        setup.party.update(setup.characters, 10_250)
        expect(setup.party.snapshot(leader.id).activeJob?.progress).toBe(1)
        leader.locationId = 'map-1-0'
        setup.party.update(setup.characters, 10_300)
        explorer.locationId = 'map-2-0'
        setup.party.update(setup.characters, 10_400)
        leader.locationId = setup.contact.locationId
        setup.turnIn(leader)
        expect(setup.gold.snapshot(leader.id).gold).toBe(12)
        expect(setup.gold.snapshot(explorer.id).gold).toBe(12)
        expect(setup.gold.snapshot(camper.id).gold).toBe(11)
    })

    it('uses real nearby guild NPCs, leader authority, and solo contracts', () => {
        const setup = scenario()
        const leader = setup.first()
        const member = setup.players[1]
        if (member === undefined) {
            throw new Error('Missing member')
        }
        setup.join(leader, member)
        setup.command(member, { questId: 'slime_hunt', type: 'guild_accept' })
        expect(setup.party.snapshot(leader.id).activeJob).toBeNull()
        leader.position.x += 65
        setup.command(leader, { questId: 'slime_hunt', type: 'guild_accept' })
        expect(setup.party.snapshot(leader.id).activeJob).toBeNull()
        leader.position.x -= 65
        setup.command(leader, { type: 'party_leave' })
        setup.command(leader, { questId: 'slime_hunt', type: 'guild_accept' })
        expect(setup.party.snapshot(leader.id).activeJob?.id).toBe('slime_hunt')
    })
})

function scenario(count = 3) {
    const gold = new AdventureService()
    const party = new PartyService(gold.grantQuestGoldOnce)
    const players = Array.from(
        { length: count },
        (_, index) =>
            new GameCharacter({
                archetype: 'human',
                controllerKind: 'network_player',
                id: `hero-${String(index)}`,
                nickname: `Hero ${String(index)}`,
                spawnPosition: { x: 80, y: 80 },
            })
    )
    const contact = new GameCharacter({
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        id: 'npc_merchant_1',
        nickname: 'Guild keeper',
        spawnPosition: { x: 80, y: 80 },
    })
    const characters = [...players, contact]
    const find = (id: string) =>
        characters.find((character) => character.id === id)
    const command = (actor: GameCharacter, message: PartyClientMessage) =>
        party.handle(actor, message, characters, 10_000)
    const join = (leader: GameCharacter, target: GameCharacter) => {
        command(leader, { targetId: target.id, type: 'party_invite' })
        const invitation = party
            .snapshot(target.id)
            .invitations.find((entry) => entry.toId === target.id)
        if (invitation === undefined) {
            throw new Error('Missing invitation')
        }
        command(target, {
            accept: true,
            invitationId: invitation.id,
            type: 'party_answer',
        })
    }
    const kill = (
        actor: GameCharacter,
        archetype: 'slime' | 'skeleton',
        id: string,
        replay = false
    ) => {
        const target = new GameCharacter({
            archetype,
            controllerKind: 'mob1',
            faction: 'monsters',
            id,
            locationId: actor.locationId,
            nickname: id,
            spawnPosition: { x: 80, y: 88 },
        })
        target.applyDamage(target.hp, 10_000)
        target.queueRespawn(10_000, 15_000)
        characters.push(target)
        const event: GameEventPayload = {
            actorId: actor.id,
            kind: 'death',
            targetId: target.id,
        }
        party.observe(replay ? [event, event] : [event], find)
    }
    party.update(characters, 10_000)
    return {
        gold,
        party,
        players,
        contact,
        characters,
        command,
        turnIn: (actor: GameCharacter) =>
            command(actor, {
                type: 'guild_turn_in',
                instanceId:
                    party.snapshot(actor.id).activeJob?.instanceId ?? 'missing',
            }),
        join,
        kill,
        find,
        first: () => {
            const first = players[0]
            if (first === undefined) {
                throw new Error('Missing leader')
            }
            return first
        },
    }
}
