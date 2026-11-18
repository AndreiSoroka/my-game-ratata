import type {
    NpcQuestDecision,
    QuestInvitationSnapshot,
    WorkRequestSnapshot,
} from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { parseNpcQuestDecision } from '../src/game/npcQuestCommands'
import {
    QUEST_INVITATION_COOLDOWN_MS,
    QUEST_INVITATION_TTL_MS,
} from '../src/game/npcQuestInvitations'
import type { NpcQuestDecisionContext } from '../src/game/npcQuestTypes'
import { npcQuestFixture } from './npcQuestFixture'

function setup() {
    const f = npcQuestFixture()
    const decision: Extract<NpcQuestDecision, { type: 'quest_propose' }> = {
        type: 'quest_propose',
        targetId: f.player.id,
        draft: f.draft(),
    }
    const autonomous = {
        autonomous: true,
        introduction: 'У меня есть дело. Хочешь посмотреть условия?',
    }
    const stage = (now = 10) =>
        f.service.handleDecision(f.issuer, decision, now, autonomous)
    const invitation = (now = 10): QuestInvitationSnapshot => {
        const value = f.service.invitationFor(f.issuer.id, f.player.id, now)
        if (value === null) {
            throw new Error('Missing invitation')
        }
        return value
    }
    const reply = (messageId = 'yes', at = 20): NpcQuestDecisionContext => ({
        autonomous: false,
        freshDialogueTargetId: f.player.id,
        freshDialogueMessageId: messageId,
        freshDialogueAt: at,
        introduction: 'Хорошо, вот условия поручения.',
    })
    const answer = (
        show = true,
        id = invitation().id,
        context = reply(),
        now = 20
    ) =>
        f.service.handleDecision(
            f.issuer,
            {
                type: 'quest_invitation_answer',
                targetId: f.player.id,
                invitationId: id,
                show,
            },
            now,
            context
        )
    return { ...f, decision, autonomous, stage, invitation, reply, answer }
}

it('stages a checked invitation with no modal, journal, contract or reward reservation', () => {
    const f = setup()
    const fund = f.service.cityFund(f.issuer.locationId)
    const newId = vi.spyOn(f.adventure.questFunding, 'newId')
    expect(
        f.service.previewDecision(f.issuer, f.decision, 10, f.autonomous)
    ).toBeUndefined()
    expect(newId).not.toHaveBeenCalled()
    expect(f.stage().accepted).toBe(true)
    expect(f.invitation()).toMatchObject({
        issuerId: f.issuer.id,
        targetId: f.player.id,
        createdAt: 10,
        expiresAt: 10 + QUEST_INVITATION_TTL_MS,
        title: f.decision.draft.title,
    })
    expect(f.service.snapshot(f.player.id, 10)).toEqual({
        questOffer: null,
        quest: null,
    })
    expect(f.service.snapshot(f.friend.id, 10)).toEqual({
        questOffer: null,
        quest: null,
    })
    expect(f.service.invitationFor(f.issuer.id, f.friend.id, 10)).toBeNull()
    expect(f.service.journal.forRecipient(f.player.id)).toEqual([])
    expect(f.service.cityFund(f.issuer.locationId)).toBe(fund)
    expect(f.parties.contractGroup(f.player.id).occupied).toBe(false)
})

it('shows exactly one ordinary offer after a fresh answer, still awaiting Take', () => {
    const f = setup()
    f.stage()
    const id = f.invitation().id
    expect(f.answer(true, id).accepted).toBe(true)
    expect(f.service.invitationFor(f.issuer.id, f.player.id, 20)).toBeNull()
    expect(f.service.canInvite(f.issuer.id, f.player.id, 20)).toBe(false)
    const offer = f.service.snapshot(f.player.id, 20).questOffer
    expect(offer).toMatchObject({
        title: f.decision.draft.title,
        introduction: f.reply().introduction,
    })
    expect(f.service.snapshot(f.player.id, 20).quest).toBeNull()
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    expect(f.answer(true, id).accepted).toBe(false)
    expect(f.service.snapshot(f.player.id, 20).questOffer).toEqual(offer)
    expect(f.service.journal.forRecipient(f.player.id)).toHaveLength(1)
    if (offer === null || offer === undefined) {
        throw new Error('Missing offer')
    }
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: offer.id,
                revision: offer.revision,
                accept: true,
            },
            30
        ).accepted
    ).toBe(true)
    expect(f.service.cityFund(f.issuer.locationId)).toBe(290)
})

it('declines without opening a modal and permits a direct request during the ten-minute pause', () => {
    const f = setup()
    f.stage()
    expect(f.answer(false).accepted).toBe(true)
    expect(f.service.snapshot(f.player.id, 20).questOffer).toBeNull()
    expect(
        f.service.canInvite(
            f.issuer.id,
            f.player.id,
            20 + QUEST_INVITATION_COOLDOWN_MS - 1
        )
    ).toBe(false)
    expect(
        f.service.canInvite(
            f.issuer.id,
            f.player.id,
            20 + QUEST_INVITATION_COOLDOWN_MS
        )
    ).toBe(true)
    expect(
        f.service.handleDecision(
            f.issuer,
            f.decision,
            30,
            f.reply('direct', 30)
        ).accepted
    ).toBe(true)
    expect(f.service.snapshot(f.player.id, 30).questOffer).not.toBeNull()
})

it('keeps the proactive pause after showing and declining the actual offer while allowing a fresh direct request', () => {
    const f = setup()
    f.stage()
    expect(f.answer().accepted).toBe(true)
    const offer = f.service.snapshot(f.player.id, 20).questOffer
    if (offer === null || offer === undefined) {
        throw new Error('Missing shown offer')
    }
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: offer.id,
                revision: offer.revision,
                accept: false,
            },
            30
        ).accepted
    ).toBe(true)
    expect(f.service.canInvite(f.issuer.id, f.player.id, 30)).toBe(false)
    expect(f.stage(40).accepted).toBe(false)
    expect(
        f.service.handleDecision(
            f.issuer,
            f.decision,
            50,
            f.reply('fresh-direct-request', 50)
        ).accepted
    ).toBe(true)
    expect(f.service.snapshot(f.player.id, 50).questOffer?.id).not.toBe(
        offer.id
    )
})

it('expires after two minutes and measures the pause from expiry even before cleanup', () => {
    const f = setup()
    f.stage()
    const id = f.invitation().id
    const expires = 10 + QUEST_INVITATION_TTL_MS
    expect(
        f.service.invitationFor(f.issuer.id, f.player.id, expires)
    ).toBeNull()
    expect(f.answer(true, id, f.reply('late', expires), expires).accepted).toBe(
        false
    )
    expect(
        f.service.canInvite(
            f.issuer.id,
            f.player.id,
            expires + QUEST_INVITATION_COOLDOWN_MS - 1
        )
    ).toBe(false)
    f.service.update(expires + 1)
    expect(
        f.service.canInvite(
            f.issuer.id,
            f.player.id,
            expires + QUEST_INVITATION_COOLDOWN_MS
        )
    ).toBe(true)
})

it.each([
    'no message',
    'other player',
    'old message',
    'future message',
    'nonfinite message',
    'autonomous',
    'empty intro',
] as const)(
    'rejects an invitation answer with %s without consuming it',
    (attempt) => {
        const f = setup()
        f.stage()
        const context = f.reply()
        if (attempt === 'no message') {
            delete context.freshDialogueMessageId
        }
        if (attempt === 'other player') {
            context.freshDialogueTargetId = f.friend.id
        }
        if (attempt === 'old message') {
            context.freshDialogueAt = 9
        }
        if (attempt === 'future message') {
            context.freshDialogueAt = 21
        }
        if (attempt === 'nonfinite message') {
            context.freshDialogueAt = Number.NaN
        }
        if (attempt === 'autonomous') {
            context.autonomous = true
        }
        if (attempt === 'empty intro') {
            context.introduction = ' '
        }
        expect(f.answer(true, f.invitation().id, context).accepted).toBe(false)
        expect(
            f.service.invitationFor(f.issuer.id, f.player.id, 20)
        ).not.toBeNull()
        expect(f.service.snapshot(f.player.id, 20).questOffer).toBeNull()
    }
)

it.each([
    'other issuer',
    'stale invitation',
    'lost contact',
    'disconnected',
    'new identity',
    'new body',
    'death',
] as const)('revalidates %s before showing conditions', (attempt) => {
    const f = setup()
    f.stage()
    const invite = f.invitation()
    if (attempt === 'lost contact') {
        f.player.position = { x: 450, y: 450 }
    }
    if (attempt === 'disconnected') {
        f.player.connected = false
    }
    if (attempt === 'death') {
        f.player.deathSequence++
    }
    if (attempt === 'new body') {
        f.characters.set(
            f.player.id,
            new GameCharacter({
                id: f.player.id,
                nickname: f.player.nickname,
                archetype: 'human',
                controllerKind: 'network_player',
                spawnPosition: { x: 80, y: 80 },
            })
        )
    }
    const actor = attempt === 'other issuer' ? f.merchant : f.issuer
    const targetId = attempt === 'new identity' ? f.friend.id : f.player.id
    const id = attempt === 'stale invitation' ? 'stale' : invite.id
    expect(
        f.service.handleDecision(
            actor,
            {
                type: 'quest_invitation_answer',
                targetId,
                invitationId: id,
                show: true,
            },
            20,
            f.reply()
        ).accepted
    ).toBe(false)
    expect(f.service.snapshot(f.player.id, 20).questOffer).toBeNull()
})

it('rechecks current reward funds and preserves the invitation and previous proposal on failure', () => {
    const f = setup()
    f.stage()
    const wallet = f.adventure.questFunding.wallet(f.issuer.locationId)
    if (wallet === undefined) {
        throw new Error('Missing city wallet')
    }
    wallet.gold = 0
    expect(f.answer().accepted).toBe(false)
    expect(f.service.snapshot(f.player.id, 20).questOffer).toBeNull()
    expect(f.service.invitationFor(f.issuer.id, f.player.id, 20)).not.toBeNull()
    expect(f.service.journal.forRecipient(f.player.id)).toEqual([])
})

it('requires an introduction before checking or committing either model proposal path', () => {
    const f = setup()
    for (const autonomous of [true, false]) {
        const context = { autonomous, introduction: ' ' }
        expect(
            f.service.previewDecision(f.issuer, f.decision, 10, context)
        ).toBeDefined()
        expect(
            f.service.handleDecision(f.issuer, f.decision, 10, context).accepted
        ).toBe(false)
    }
    expect(f.service.invitationFor(f.issuer.id, f.player.id, 10)).toBeNull()
    expect(f.service.snapshot(f.player.id, 10).questOffer).toBeNull()
})

it('does not replace a pending invitation on autonomous repetition and keeps another pair independent', () => {
    const f = setup()
    f.stage()
    const first = f.invitation()
    expect(f.stage(20).accepted).toBe(false)
    expect(f.invitation(20)).toEqual(first)
    const other = { ...f.decision, targetId: f.friend.id }
    expect(
        f.service.handleDecision(f.issuer, other, 20, f.autonomous).accepted
    ).toBe(true)
    expect(f.service.invitationFor(f.issuer.id, f.friend.id, 20)?.id).not.toBe(
        first.id
    )
})

it('revalidates a worker request after invitation without claiming or funding it', () => {
    const f = setup()
    const request: WorkRequestSnapshot = {
        id: 'worker-incident',
        workerName: 'Работник',
        workerId: 'worker',
        cityId: f.issuer.locationId,
        clerkId: f.issuer.id,
        locationId: 'map-2-1',
        locationName: 'Северная застава',
        enemyName: 'скелет',
        requiredTrophyItemId: 'bone',
        proofAccepted: false,
        stage: 'waiting',
        reason: null,
    }
    const list = vi.spyOn(f.workers, 'list').mockReturnValue([request])
    const accept = vi.spyOn(f.workers, 'accept')
    expect(
        f.service.handleDecision(
            f.issuer,
            {
                type: 'worker_quest_propose',
                targetId: f.player.id,
                requestId: request.id,
            },
            10,
            f.autonomous
        ).accepted
    ).toBe(true)
    expect(f.invitation()).toMatchObject({ workerRequestId: request.id })
    list.mockReturnValue([])
    expect(f.answer().accepted).toBe(false)
    expect(f.service.snapshot(f.player.id, 20).questOffer).toBeNull()
    expect(accept).not.toHaveBeenCalled()
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
})

it('parses only the intended invitation answer fields and refuses malformed input', () => {
    const decision = {
        type: 'quest_invitation_answer',
        targetId: 'player',
        invitationId: 'invitation',
        show: true,
    }
    expect(
        parseNpcQuestDecision({ ...decision, freshDialogueTargetId: 'forged' })
    ).toEqual(decision)
    for (const change of [
        { targetId: '' },
        { invitationId: '' },
        { show: 'yes' },
    ]) {
        expect(
            parseNpcQuestDecision({ ...decision, ...change })
        ).toBeUndefined()
    }
})
