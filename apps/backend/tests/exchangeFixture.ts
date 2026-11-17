import type { ExchangeClientMessage } from '@my-game-ratata/contracts'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { ExchangeService } from '../src/game/exchange'
import { NavigationService } from '../src/game/navigation'

export function exchangeFixture(ai = false) {
    const character = (id: string, scripted = false) =>
        new GameCharacter({
            id,
            nickname: id,
            archetype: 'human',
            controllerKind: scripted ? 'scripted' : 'network_player',
            faction: 'peaceful',
            spawnPosition: { x: 80, y: 80 },
        })
    const a = character('a')
    const b = character('b', ai)
    const characters = new Map([
        [a.id, a],
        [b.id, b],
    ])
    const navigation = new NavigationService({
        id: 'test',
        solidLayerNames: [],
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
    })
    const adventure = new AdventureService({ now: () => 0 })
    let lease = !ai
    const invites: string[] = []
    const service = new ExchangeService({
        getCharacter: (id) => characters.get(id),
        navigationFor: () => navigation,
        aiDialogue: (actor) => ai && actor.id === b.id,
        canControlAI: () => lease,
        walletFor: adventure.walletFor,
        onInvite: (_actor, partner, id) => {
            invites.push(`${partner}:${id}`)
        },
    })
    const send = (actor: GameCharacter, message: ExchangeClientMessage) =>
        service.handle(actor, message, 0)
    const open = () => {
        send(a, { type: 'exchange_invite', targetId: b.id })
        const id = service.snapshot(a.id)?.id ?? ''
        send(b, { type: 'exchange_answer', exchangeId: id, accept: true })
        return id
    }
    const offer = (
        actor: GameCharacter,
        gold: number,
        items: Array<{ instanceId: string; quantity: number }> = []
    ) =>
        send(actor, {
            type: 'exchange_offer',
            exchangeId: service.snapshot(actor.id)?.id ?? '',
            revision: service.snapshot(actor.id)?.revision ?? 0,
            gold,
            items,
        })
    const accept = (actor: GameCharacter) =>
        send(actor, {
            type: 'exchange_accept',
            exchangeId: service.snapshot(actor.id)?.id ?? '',
            revision: service.snapshot(actor.id)?.revision ?? 0,
        })
    return {
        a,
        b,
        adventure,
        navigation,
        service,
        send,
        open,
        offer,
        accept,
        invites,
        setLease: (value: boolean) => {
            lease = value
        },
    }
}
