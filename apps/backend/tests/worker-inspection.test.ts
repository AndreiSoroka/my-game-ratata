import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { configureNpcQuestDialogue } from '../src/game/npcQuestDialogue'
import { NpcQuestService } from '../src/game/npcQuests'
import { PartyService } from '../src/game/parties'
import { workerActivity } from '../src/game/workerActivity'
import { WorkerSimulation } from './workerRequestFixture'

it('gives a nearby model and human the same structured earned status without holding the model inspection open', () => {
    const f = new WorkerSimulation('farmer')
    f.publish()
    const parties = new PartyService(f.adventure.grantQuestGoldOnce)
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
    const observer = new GameCharacter({
        id: 'npc_magic_slime_1',
        nickname: 'Капля',
        archetype: 'slime',
        controllerKind: 'scripted',
        faction: 'peaceful',
        locationId: f.worker.locationId,
        spawnPosition: f.worker.position,
        soul: { canSpeak: true, controlSource: 'model' },
    })
    f.characters.set(observer.id, observer)
    f.worker.setPath([{ x: f.worker.position.x + 64, y: f.worker.position.y }])
    const path = f.worker.remainingPath()
    const result = f.adventure.handleResult(
        observer,
        { type: 'interact', targetId: f.worker.id },
        [...f.characters.values()],
        f.room.navigationFor(observer),
        f.now
    )
    const event = result.events.find((entry) => entry.kind === 'chat')
    expect(result.accepted).toBe(true)
    expect(event?.audienceIds).toEqual([observer.id])
    expect(event?.workerActivity).toEqual(
        workerActivity(f.worker, f.adventure, f.requests, f.now)
    )
    expect(event?.workerActivity).toMatchObject({
        reason: 'request',
        stage: 'waiting',
        danger: { status: 'reported' },
    })
    expect(event?.text).toContain(event?.workerActivity?.text)
    f.adventure.reconcileConversations(f.characters.values(), (actor) =>
        f.room.navigationFor(actor)
    )
    expect(
        f.adventure.snapshot(observer.id, observer.locationId, observer)
            .dialogue
    ).toBeNull()
    expect(f.worker.remainingPath()).toEqual(path)
    f.player.position = { ...observer.position }
    const human = f.adventure.handleResult(
        f.player,
        { type: 'interact', targetId: f.worker.id },
        [...f.characters.values()],
        f.room.navigationFor(f.player),
        f.now
    )
    expect(
        human.events.find((entry) => entry.kind === 'chat')?.workerActivity
    ).toEqual(event?.workerActivity)
    expect(
        f.adventure.snapshot(f.player.id, f.player.locationId, f.player)
            .dialogue?.text
    ).toContain(event?.workerActivity?.text)
})
