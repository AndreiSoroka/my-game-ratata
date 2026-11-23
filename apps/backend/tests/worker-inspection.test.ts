import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { configureNpcQuestDialogue } from '../src/game/npcQuestDialogue'
import { NpcQuestService } from '../src/game/npcQuests'
import { PartyService } from '../src/game/parties'
import { workerActivity } from '../src/game/workerActivity'
import { WorkerSimulation } from './workerRequestFixture'

it('records nearby inspections independently of speech and preserves the worker path', () => {
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
    expect(result.accepted).toBe(true)
    expect(result.events.some((event) => event.kind === 'chat')).toBe(false)
    expect(
        workerActivity(f.worker, f.adventure, f.requests, f.now)
    ).toMatchObject({
        reason: 'request',
        stage: 'waiting',
        danger: { status: 'reported' },
    })
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
    expect(human.accepted).toBe(true)
    expect(human.events.some((event) => event.kind === 'chat')).toBe(false)
    expect(
        f.adventure.snapshot(f.player.id, f.player.locationId, f.player)
            .dialogue
    ).toMatchObject({ npcId: f.worker.id, text: '' })
})
