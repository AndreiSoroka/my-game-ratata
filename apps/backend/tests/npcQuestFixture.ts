import type { QuestDraft } from '@my-game-ratata/contracts'
import { expect } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'
import { NpcQuestService } from '../src/game/npcQuests'
import { PartyService } from '../src/game/parties'
import { WorkerRequestService } from '../src/game/workerRequests'

export function npcQuestFixture() {
    const create = (id: string, scripted = false) =>
        new GameCharacter({
            id,
            nickname: id,
            archetype: 'human',
            controllerKind: scripted ? 'scripted' : 'network_player',
            faction: 'peaceful',
            spawnPosition: { x: 80, y: 80 },
        })
    const player = create('player')
    const friend = create('friend')
    const issuer = create('npc_friendly_girl_1', true)
    const merchant = create('npc_merchant_1', true)
    merchant.position = { x: 400, y: 80 }
    const characters = new Map(
        [player, friend, issuer, merchant].map((actor) => [actor.id, actor])
    )
    const adventure = new AdventureService({ now: () => 0 })
    const parties = new PartyService(adventure.grantQuestGoldOnce, {
        canContact: (_actor, npc) => npc.id === issuer.id && npc.alive,
    })
    parties.update(characters.values(), 0)
    const workers = new WorkerRequestService()
    const navigation = new NavigationService({
        id: 'test',
        solidLayerNames: [],
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(1024).fill(false),
    })
    const service = new NpcQuestService({
        adventure,
        parties,
        workers,
        characters: () => characters.values(),
        getCharacter: (id) => characters.get(id),
        navigationFor: () => navigation,
        canIssue: () => true,
    })
    const draft = (changes: Partial<QuestDraft> = {}): QuestDraft => ({
        title: 'Сведения о товарах',
        description: 'Расспроси торговца и вернись.',
        objectives: [{ kind: 'inspect', targetId: merchant.id }],
        funding: 'city',
        rewardGold: 10,
        rewardItems: [],
        ...changes,
    })
    const accept = (
        value = draft(),
        mode: 'submitter' | 'party_equal' = 'submitter'
    ) => {
        expect(service.propose(issuer, player.id, value, 10).accepted).toBe(
            true
        )
        const offer = service.snapshot(player.id, 10).questOffer
        if (offer === null || offer === undefined) {
            throw new Error('Missing offer')
        }
        expect(
            service.handle(
                player,
                {
                    type: 'quest_offer_answer',
                    offerId: offer.id,
                    revision: offer.revision,
                    accept: true,
                    rewardMode: mode,
                },
                20
            ).accepted
        ).toBe(true)
        const job = service.snapshot(player.id, 20).quest
        if (job === null || job === undefined) {
            throw new Error('Missing job')
        }
        return job.instanceId
    }
    const turnIn = (id: string) =>
        service.handle(
            player,
            { type: 'npc_quest_turn_in', instanceId: id },
            30
        )
    const putTableBetweenPlayerAndIssuer = () => {
        player.position = { x: 72, y: 88 }
        issuer.position = { x: 104, y: 88 }
        const table = 5 * navigation.grid.width + 5
        navigation.grid.solid[table] = true
        navigation.grid.speechTransparent = new Set([table])
    }
    return {
        player,
        friend,
        issuer,
        merchant,
        characters,
        adventure,
        parties,
        workers,
        navigation,
        service,
        draft,
        accept,
        turnIn,
        putTableBetweenPlayerAndIssuer,
    }
}
