import { describe, expect, it } from 'vitest'

import { fixture } from './workerGuildFixture'

describe('worker contracts through the guild', () => {
    it('keeps a ready worker locked when an atomic payment fails and retries once', () => {
        const f = fixture()
        f.accept()
        f.request.stage = 'ready'
        f.guild.turnIn(
            'solo:hero',
            f.instance(),
            f.actor.id,
            f.members,
            f.characters,
            () => ({ ok: false, shares: [] }),
            2000
        )
        expect(f.gateway.complete).not.toHaveBeenCalled()
        expect(f.guild.snapshots('solo:hero')[0]?.status).toBe('ready')
        f.turnIn()
        expect(f.gateway.complete).toHaveBeenCalledTimes(1)
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(30)
    })

    it('clears a stale orphaned instance before accepting a different contract', () => {
        const f = fixture()
        f.accept()
        f.gateway.abandon(f.request.id, 'solo:hero', 2000)
        f.guild.accept(
            'solo:hero',
            'slime_hunt',
            f.actor.id,
            f.members,
            f.characters
        )
        expect(f.guild.snapshots('solo:hero')[0]?.id).toBe('slime_hunt')
    })

    it('claims exclusively, gates payment on the worker’s return, and rechecks danger at hand-in', () => {
        const f = fixture()
        f.accept()
        f.accept('other-group')
        expect(f.guild.snapshots('other-group')).toEqual([])
        const instanceId = f.instance()
        f.guild.report('solo:hero', 'obsolete', f.actor, 1001)
        expect(f.gateway.report).not.toHaveBeenCalled()
        f.guild.report('solo:hero', instanceId, f.actor, 1002)
        f.turnIn()
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
        f.request.stage = 'ready'
        f.unsafe(true)
        f.turnIn()
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
        f.unsafe(false)
        f.turnIn('obsolete')
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
        f.turnIn()
        f.turnIn(instanceId)
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(30)
        expect(f.gateway.complete).toHaveBeenCalledTimes(1)
    })

    it('keeps a new instance safe from stale abandonment and report messages', () => {
        const f = fixture()
        f.accept()
        const old = f.instance()
        f.guild.abandon('solo:hero', 'obsolete', 1100)
        expect(f.gateway.abandon).not.toHaveBeenCalled()
        f.guild.abandon('solo:hero', old, 1101)
        f.accept()
        expect(f.instance()).not.toBe(old)
        f.guild.report('solo:hero', old, f.actor, 1102)
        f.guild.abandon('solo:hero', old, 1103)
        expect(f.guild.snapshots('solo:hero')[0]?.status).toBe('active')
        expect(f.gateway.report).not.toHaveBeenCalled()
        expect(f.gateway.abandon).toHaveBeenCalledTimes(1)
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
    })

    it('preserves the accepted instance when a solo actor forms a party and refreshes membership', () => {
        const f = fixture()
        f.accept()
        const id = f.instance()
        f.guild.moveJob('solo:hero', 'party_1')
        expect(f.guild.snapshots('solo:hero')).toEqual([])
        expect(f.guild.snapshots('party_1')[0]?.instanceId).toBe(id)
        f.guild.update('party_1', f.members, f.characters)
        expect(f.gateway.refreshGroup).toHaveBeenLastCalledWith(
            'party_1',
            f.members
        )
        f.guild.refreshGroup('party_1', new Set())
        expect(f.gateway.refreshGroup).toHaveBeenLastCalledWith(
            'party_1',
            new Set()
        )
        expect(f.gateway.releaseGroup).not.toHaveBeenCalled()
    })

    it('accepts a worker contract alongside an authored hunt and abandons only the named instance', () => {
        const f = fixture()
        f.guild.accept(
            'solo:hero',
            'slime_hunt',
            f.actor.id,
            f.members,
            f.characters
        )
        f.accept()
        expect(f.gateway.accept).toHaveBeenCalledTimes(1)
        expect(f.guild.snapshots('solo:hero').map(({ id }) => id)).toEqual([
            'slime_hunt',
            f.request.id,
        ])
        f.guild.abandon('solo:hero', f.instance(), 2000)
        expect(f.gateway.abandon).toHaveBeenCalledTimes(1)
        expect(f.guild.snapshots('solo:hero').map(({ id }) => id)).toEqual([
            'slime_hunt',
        ])
    })
})
