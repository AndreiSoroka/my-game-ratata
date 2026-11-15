import type { AbilityContext } from '../src/game/abilityContext'
import { GameCharacter } from '../src/game/character'
import { advanceRevive } from '../src/game/characterLife'
import { pray } from '../src/game/prayer'
import { graveFixture } from './graveTestHelpers'

export const prayerNow = 10_000
export const prayerSource = {
    id: 'purification-grave',
    locationId: 'map-3-2',
    position: { x: 168, y: 168 },
}

export function gravePrayerFixture(scripted = false) {
    const f = graveFixture()
    f.service.register(prayerSource, [], prayerNow, 30_000)
    const actor = new GameCharacter({
        id: 'cleric',
        nickname: 'Cleric',
        archetype: 'human',
        heroClass: 'cleric',
        controllerKind: scripted ? 'scripted' : 'network_player',
        faction: 'peaceful',
        locationId: prayerSource.locationId,
        spawnPosition: { x: 136, y: 168 },
    })
    f.characters.set(actor.id, actor)
    const context = (now: number): AbilityContext => ({
        characters: [...f.characters.values()],
        navigation: f.navigation,
        now,
        random: () => 0,
        graves: {
            get: (id) => f.service.get(id),
            list: (id) => f.service.snapshot(id),
            damage: (id, amount, at) => f.service.damage(id, amount, at),
            purify: (id, at) => f.service.purify(id, at),
            contributePurification: (
                id: string,
                receiptId: string,
                at: number
            ) => f.service.contributePurification(id, receiptId, at),
        },
    })
    const begin = (now = prayerNow) =>
        pray(actor, now, undefined, context(now), {
            mode: 'purify_grave',
            target: { kind: 'grave', id: prayerSource.id },
        })
    const advance = (now: number) =>
        advanceRevive(actor, () => undefined, now, undefined, context(now))
    return { ...f, actor, context, spawnContext: f.context, begin, advance }
}
