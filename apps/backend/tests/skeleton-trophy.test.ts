import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import type { WorldChest } from '../src/game/chestInteraction'
import { createItemInstance } from '../src/game/inventory'
import { WorldDeathLoot } from '../src/game/worldDeathLoot'

function fixture(
    kind: 'hostile' | 'friendly' | 'player' | 'human-source' = 'hostile'
) {
    const actor = new GameCharacter({
        id: 'skeleton',
        nickname: 'Скелет',
        archetype: 'skeleton',
        controllerKind: kind === 'player' ? 'network_player' : 'mob1',
        faction: kind === 'friendly' ? 'peaceful' : 'monsters',
        mortal: false,
        spawnPosition: { x: 64, y: 64 },
    })
    if (kind === 'human-source') {
        actor.soul.controlSource = 'human'
    }
    const sword = createItemInstance('old_sword')
    actor.equipment.weapon = sword
    const corpses = new Map<string, WorldChest>()
    const loot = new WorldDeathLoot(actor.locationId, corpses)
    const deaths = [{ kind: 'death' as const, targetId: actor.id }]
    const die = (now: number) => {
        actor.applyDamage(actor.hp, now)
        actor.queueRespawn(now, 15_000)
        loot.resolve(deaths, () => actor)
    }
    return { actor, sword, corpses, loot, deaths, die }
}

describe('skeleton proof in finite shared corpse loot', () => {
    it('adds one bone beside the real sword and ignores repeated death receipts', () => {
        const f = fixture()
        f.die(1000)
        const contents = f.corpses.get('corpse:skeleton:1')?.contents
        expect(contents?.map((item) => item.itemId)).toEqual([
            'old_sword',
            'bone',
        ])
        expect(contents?.[0]).toBe(f.sword)
        expect(f.actor.equipment).toEqual({})
        expect(f.loot.resolve(f.deaths, () => f.actor)).toEqual([])
        expect(f.corpses.size).toBe(1)
        expect(contents).toHaveLength(2)
    })

    it('gives a new bone after real respawn without recreating the old weapon', () => {
        const f = fixture()
        f.die(1000)
        f.actor.tickTimedState(16_000)
        expect(f.actor.alive).toBe(true)
        f.die(17_000)
        expect(f.corpses.size).toBe(2)
        expect(
            f.corpses
                .get('corpse:skeleton:2')
                ?.contents.map((item) => item.itemId)
        ).toEqual(['bone'])
    })

    it.each(['friendly', 'player', 'human-source'] as const)(
        'does not mint a trophy for %s actors',
        (kind) => {
            const f = fixture(kind)
            f.die(1000)
            expect(
                [...f.corpses.values()]
                    .flatMap((corpse) => corpse.contents)
                    .map((item) => item.itemId)
            ).toEqual(['old_sword'])
        }
    )
})
