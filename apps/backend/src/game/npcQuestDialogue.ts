import {
    authoredMessage,
    type GameEventPayload,
    npcQuestMessage,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import type { NpcQuestService } from './npcQuests'
import { workerActivity } from './workerActivity'
import type { WorkerRequestService } from './workerRequests'

interface DialogueQuests {
    quests: NpcQuestService
    workers: WorkerRequestService
    find: (id: string) => GameCharacter | undefined
}
const sources = new WeakMap<AdventureService, DialogueQuests>()
const prefix = 'worker-contract:'

export function configureNpcQuestDialogue(
    adventure: AdventureService,
    quests: NpcQuestService,
    workers: WorkerRequestService,
    find: DialogueQuests['find']
): void {
    sources.set(adventure, { quests, workers, find })
}

/** The clerk and guild board read the same incidents; dialogue never clones one. */
export function extendNpcQuestDialogue(
    adventure: AdventureService,
    actor: GameCharacter,
    state: PlayerAdventure,
    events: GameEventPayload[],
    now: number
): GameEventPayload[] {
    const source = sources.get(adventure)
    const dialogue = state.dialogue
    if (source === undefined || dialogue === null) {
        return events
    }
    const requests =
        actor.controllerKind !== 'network_player'
            ? []
            : source.workers
                  .list()
                  .filter((request) => request.clerkId === dialogue.npcId)
    const choices = requests.map((request) => ({
        id: `${prefix}${request.id}`,
        label: `Обращение: ${request.workerName} — ${request.reason ?? request.enemyName}`,
        labelMessage: authoredMessage('dialogue.workerRequest', {
            worker: request.workerName,
            reason: request.reason ?? request.enemyName,
        }),
    }))
    dialogue.choices = [
        ...dialogue.choices.filter((choice) => !choice.id.startsWith(prefix)),
        ...choices,
    ]
    const npc = source.find(dialogue.npcId)
    const activity =
        npc === undefined
            ? undefined
            : workerActivity(npc, adventure, source.workers, now)
    if (activity !== undefined) {
        dialogue.text += ` ${activity.text}`
        const textMessage = npcQuestMessage(activity.text)
        dialogue.workerActivity = {
            ...activity,
            ...(textMessage === undefined ? {} : { textMessage }),
        }
    }
    return activity === undefined
        ? events
        : events.map((event) =>
              event.kind === 'chat' &&
              event.actorId === npc?.id &&
              event.targetId === actor.id
                  ? {
                        ...event,
                        text: dialogue.text,
                        workerActivity: dialogue.workerActivity ?? activity,
                    }
                  : event
          )
}

export function chooseNpcQuestDialogue(
    adventure: AdventureService,
    actor: GameCharacter,
    state: PlayerAdventure,
    choiceId: string,
    now: number
): GameEventPayload[] | undefined {
    if (!choiceId.startsWith(prefix)) {
        return undefined
    }
    const source = sources.get(adventure)
    const issuer = source?.find(state.dialogue?.npcId ?? '')
    if (
        source === undefined ||
        issuer === undefined ||
        state.dialogue?.choices.some((choice) => choice.id === choiceId) !==
            true
    ) {
        return [
            {
                kind: 'notice',
                actorId: actor.id,
                audienceIds: [actor.id],
                text: 'Обращение недоступно. Откройте разговор снова.',
            },
        ]
    }
    const result = source.quests.workerPropose(
        issuer,
        actor.id,
        choiceId.slice(prefix.length),
        now
    )
    if (result.accepted) {
        state.dialogue = null
    }
    return result.error === null
        ? result.events
        : [
              ...result.events,
              {
                  kind: 'notice',
                  actorId: actor.id,
                  audienceIds: [actor.id],
                  text: result.error,
              },
          ]
}
