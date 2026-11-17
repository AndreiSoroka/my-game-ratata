import type { GameCharacter } from './character'
import { inspectQuest } from './npcQuestProgress'
import type { NpcQuestResult } from './npcQuests'
import {
    type NpcQuestEnvironment,
    type NpcQuestRecord,
    questContact,
} from './npcQuestTypes'
import { createSpeechEvent } from './speechReceipts'

interface InquiryContext {
    environment: NpcQuestEnvironment
    jobs: ReadonlyMap<string, NpcQuestRecord>
    refresh: (job: NpcQuestRecord) => void
    record: (job: NpcQuestRecord, now: number) => void
}

export function inquireNpcQuest(
    context: InquiryContext,
    actor: GameCharacter,
    instanceId: string,
    objectiveIndex: number,
    now: number
): NpcQuestResult {
    const job = context.jobs.get(instanceId)
    const objective = job?.draft.objectives[objectiveIndex]
    if (job === undefined || objective?.kind !== 'inspect') {
        return rejected()
    }
    const target = context.environment.getCharacter(objective.targetId)
    const member = context.environment.parties
        .contractRoster(instanceId)
        .members.has(actor.id)
    if (
        job.view.status !== 'active' ||
        now < job.acceptedAt ||
        !member ||
        !questContact(actor, target, context.environment, now)
    ) {
        return rejected()
    }
    const events = context.environment.adventure.interact(
        actor,
        target.id,
        [...context.environment.characters()],
        context.environment.navigationFor(actor),
        now
    )
    const answered = events.some(
        (event) =>
            event.kind === 'chat' &&
            event.actorId === target.id &&
            event.targetId === actor.id
    )
    if (!answered) {
        return rejected('Собеседник пока не ответил на вопрос по поручению.')
    }
    inspectQuest(
        job,
        actor.id,
        target.id,
        `inquiry:${instanceId}:${String(objectiveIndex)}:${actor.id}`,
        context.environment
    )
    context.refresh(job)
    context.record(job, now)
    const question = createSpeechEvent(
        actor,
        objective.question ??
            `Я по поручению ${job.view.issuerName}: ${job.view.title}. Как обстоят дела?`,
        { targetId: target.id, audienceIds: [actor.id, target.id] }
    )
    return { accepted: true, error: null, events: [question, ...events] }
}
function rejected(
    error = 'Подойди к нужному собеседнику по действующему поручению.'
): NpcQuestResult {
    return { accepted: false, error, events: [] }
}
