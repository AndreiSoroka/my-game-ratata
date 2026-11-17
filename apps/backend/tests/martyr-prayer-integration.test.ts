import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { type GameCharacter } from '../src/game/character'
import { advanceRevive } from '../src/game/characterLife'
import { PartyService } from '../src/game/parties'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function fixture() {
    const actor = abilityHero()
    const enemy = abilityHero('vanguard', 'undead', 'mob1')
    Object.assign(enemy, { faction: 'monsters' })
    const context = abilityContext([actor, enemy])
    return { actor, enemy, context }
}
function hit(
    source: GameCharacter,
    target: GameCharacter,
    now: number,
    amount = 4
) {
    return resolveCharacterDamage({
        actor: source,
        target,
        amount,
        now,
        damageKind: 'physical',
        respawnDelayMs: 15_000,
    })
}
function selfPrayer(f: ReturnType<typeof fixture>, now: number) {
    const context = { ...f.context, now }
    const started = handleAbilityCommand(
        f.actor,
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'restore', targetId: f.actor.id },
        },
        context
    )
    expect(started).toContainEqual(
        expect.objectContaining({ kind: 'cast', phase: 'started' })
    )
    const deadline = f.actor.abilities.casting?.completesAt
    if (deadline === undefined) {
        throw new Error('Expected pending prayer')
    }
    return advanceRevive(
        f.actor,
        () => undefined,
        deadline,
        () => 0,
        { ...context, now: deadline }
    )
}

describe('Martyr through actual shared damage and ordinary Mother commands', () => {
    it('opens on five fresh hostile HP wounds and useful own prayer outcomes', () => {
        const f = fixture()
        const originalHp = f.actor.maxHp
        const originalMana = f.actor.config.resources.maxMana
        let notices = 0
        for (let index = 0; index < 5; index += 1) {
            const now = 1000 + index * 5000
            expect(hit(f.enemy, f.actor, now).trainableDamage).toBe(4)
            const events = selfPrayer(f, now + 1)
            expect(events).toContainEqual(
                expect.objectContaining({
                    kind: 'heal',
                    actorId: f.actor.id,
                    targetId: f.actor.id,
                    amount: 4,
                })
            )
            notices += events.filter(
                (event) => event.text === 'Открыта звезда: Мученик.'
            ).length
        }
        expect(notices).toBe(0)
        expect(
            f.actor.progression.constellations.opened.has('prayer.martyr')
        ).toBe(true)
        expect(f.actor.maxHp).toBe(
            Math.max(1, Math.floor((originalHp * 7) / 10))
        )
        expect(f.actor.config.combat.maxHp).toBe(originalHp)
        expect(f.actor.config.resources.maxMana).toBe(originalMana)
    })

    it('does not count fully absorbed or friendly damage as a new hostile cycle', () => {
        const f = fixture()
        f.actor.abilities.barrier = {
            remaining: 8,
            expiresAt: 10000,
            practiced: false,
        }
        expect(hit(f.enemy, f.actor, 1000).hpDamage).toBe(0)
        expect(f.actor.martyr.pendingHostileWound).toBe(false)
        const ally = abilityHero()
        f.actor.abilities.barrier = null
        expect(hit(ally, f.actor, 2000).trainableDamage).toBe(0)
        selfPrayer(f, 2001)
        expect(f.actor.martyr.cycles).toBe(0)
    })

    it('resets after a successful own attack and actual consented party join', () => {
        const f = fixture()
        hit(f.enemy, f.actor, 1000)
        selfPrayer(f, 1001)
        expect(f.actor.martyr.cycles).toBe(1)
        expect(hit(f.actor, f.enemy, 5000, 1).trainableDamage).toBe(1)
        expect(f.actor.martyr.cycles).toBe(0)
        hit(f.enemy, f.actor, 6000)
        selfPrayer(f, 6001)
        expect(f.actor.martyr.cycles).toBe(1)
        const leader = abilityHero()
        const parties = new PartyService()
        const roster = [f.actor, leader]
        parties.handle(
            leader,
            { type: 'party_invite', targetId: f.actor.id },
            roster,
            10000
        )
        expect(f.actor.martyr.cycles).toBe(1)
        const invite = parties.snapshot(f.actor.id).invitations[0]
        if (invite === undefined) {
            throw new Error('Expected invitation')
        }
        parties.handle(
            f.actor,
            { type: 'party_answer', invitationId: invite.id, accept: true },
            roster,
            10001
        )
        expect(f.actor.martyr.cycles).toBe(0)
    })
})
