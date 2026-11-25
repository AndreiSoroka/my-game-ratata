import { ExchangeService } from '../src/game/exchange'
import { configureNpcQuestDialogue } from '../src/game/npcQuestDialogue'
import { NpcQuestService } from '../src/game/npcQuests'
import { PartyService } from '../src/game/parties'
import { QuestTurnInService } from '../src/game/questTurnIn'
import {
    canContactGuild,
    createWorkerGuildGateway,
} from '../src/game/roomWorkerRequests'
import { WhisperService } from '../src/game/whispers'
import type { WorkerSimulation } from './workerRequestFixture'

export function createWorkerDialogues(f: WorkerSimulation) {
    const parties = new PartyService(f.adventure.grantQuestGoldOnce, {
        questRewards: {
            funding: f.adventure.questFunding,
            walletFor: f.adventure.walletFor,
        },
        workers: createWorkerGuildGateway(f.requests, () => f.room),
        canContact: (actor, npc) => canContactGuild(actor, npc, f.room),
    })
    parties.update(f.characters.values(), f.now)
    const quests = new NpcQuestService({
        adventure: f.adventure,
        parties,
        workers: f.requests,
        characters: () => f.characters.values(),
        getCharacter: (id) => f.characters.get(id),
        navigationFor: (actor) => f.room.navigationFor(actor),
    })
    configureNpcQuestDialogue(f.adventure, quests, f.requests, (id) =>
        f.characters.get(id)
    )
    return { parties, quests }
}

export function workerConversation(
    f: WorkerSimulation,
    locale: 'ru' | 'en' = 'ru'
) {
    const { parties, quests } = createWorkerDialogues(f)
    const getCharacter = (id: string) => f.characters.get(id)
    const navigationFor = f.room.navigationFor
    const exchanges = new ExchangeService({
        getCharacter,
        navigationFor,
        aiDialogue: () => true,
        canControlAI: () => true,
        walletFor: f.adventure.walletFor,
    })
    const whispers = new WhisperService({
        getCharacter,
        navigationFor,
        heard: () => undefined,
    })
    const turns = new QuestTurnInService({
        adventure: f.adventure,
        parties,
        quests,
        getCharacter,
        characters: () => f.characters.values(),
        navigationFor,
        localeFor: () => locale,
        exchanges,
        whispers,
    })
    return { parties, quests, turns, whispers, exchanges }
}
