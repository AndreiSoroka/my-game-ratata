import {
    CENTER_LOCATION_ID,
    type CityBellState,
} from '@my-game-ratata/contracts'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { createItemInstance } from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import type { WorldObjectDefinition } from '../src/game/worldObjectData'

export function cityBellFixture(initialBellState: CityBellState = 'silent') {
    const clock = { now: 1000 }
    const navigation = new NavigationService({
        id: CENTER_LOCATION_ID,
        width: 24,
        height: 24,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: ['solid'],
        solid: Array<boolean>(24 * 24).fill(false),
    })
    const bell: WorldObjectDefinition = {
        id: 'novogorod:memory-bell',
        kind: 'bell',
        name: 'Колокол памяти',
        text: '',
        locationId: CENTER_LOCATION_ID,
        bounds: { x: 160, y: 80, width: 16, height: 16 },
    }
    navigation.grid.solid[5 * 24 + 10] = true
    const service = new AdventureService({
        now: () => clock.now,
        resourceNodes: [],
        worldObjects: [bell],
    })
    service.initializeCities({ seed: 'city-bell-fixture', initialBellState })
    const actor = cityActor('first')
    const other = cityActor('second')
    const mira = cityActor('npc_friendly_girl_1', 'scripted')
    mira.position.x += 16
    const actors = [actor, other, mira]
    const snapshot = (who = actor) =>
        service.snapshot(who.id, who.locationId, who)
    const accept = (
        who = actor,
        rewardMode: 'submitter' | 'party_equal' = 'submitter'
    ) => {
        service.interact(who, mira.id, actors, navigation, clock.now)
        service.choose(
            who,
            'accept_quest',
            actors,
            navigation,
            clock.now,
            rewardMode
        )
    }
    const submit = (who = actor) => {
        service.interact(who, mira.id, actors, navigation, clock.now)
        return service.handleResult(
            who,
            { type: 'dialogue_choice', choiceId: 'turn_in_trophies' },
            actors,
            navigation,
            clock.now
        )
    }
    const ring = (who = actor) =>
        service.handleResult(
            who,
            { type: 'world_interact', objectId: bell.id },
            actors,
            navigation,
            clock.now
        )
    return {
        service,
        navigation,
        bell,
        actor,
        other,
        mira,
        actors,
        snapshot,
        accept,
        submit,
        ring,
        clock,
    }
}

export function cityActor(
    id: string,
    controllerKind: 'network_player' | 'scripted' = 'network_player',
    nickname = id
) {
    const actor = new GameCharacter({
        id,
        nickname,
        archetype: 'human',
        faction: 'peaceful',
        controllerKind,
        spawnPosition: { x: 168, y: 104 },
    })
    actor.connected = controllerKind === 'network_player'
    return actor
}

export function giveHearts(actor: GameCharacter, quantity = 3): void {
    actor.inventory.push(
        ...Array.from({ length: quantity }, () =>
            createItemInstance('slime_heart')
        )
    )
}
