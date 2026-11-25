import { afterEach, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { parseNecromancerDecision } from '../src/ai/necromancerProtocol'
import type { NpcAiProvider } from '../src/ai/types'
import {
    ashSkeletonGuard,
    ashSkeletonOrder,
} from '../src/game/ashSkeletonState'
import { distance } from '../src/game/math'
import { necromancerController } from '../src/game/necromancerController'
import { defendNecromancer } from '../src/game/necromancerDefense'
import { availableSlimeHunter } from '../src/game/necromancerOptions'
import { NecromancerPlanning } from '../src/game/necromancerPlanning'
import {
    type NecromancerModelContext,
    type NecromancerModelDecision,
    type NecromancerScene,
    observeNecromancerScene,
} from '../src/game/necromancerTactics'
import { GameRoom } from '../src/game/room'
import { WorldMaps } from '../src/game/worldMaps'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

let room: GameRoom | undefined

afterEach(() => {
    room?.stop()
    vi.useRealTimers()
})

function fixture(
    decide: NpcAiProvider['decide'] = () =>
        Promise.reject(new Error('Expected a compact advice turn'))
) {
    vi.useFakeTimers()
    vi.setSystemTime(120_000)
    const turns: Array<{
        context: NecromancerModelContext
        signal: AbortSignal
        resolve: (reply: NecromancerModelDecision) => void
    }> = []
    const provider: NpcAiProvider = {
        decide,
        decideNecromancer(context, _settings, signal) {
            const { promise, resolve } =
                Promise.withResolvers<NecromancerModelDecision>()
            turns.push({ context, signal, resolve })
            return promise
        },
    }
    const game = new GameRoom(undefined, {
        worldMaps: new WorldMaps({ seed: 'savva-ai-fixture' }),
        ai: {
            config: parseNpcAiConfig(
                {
                    npcs: [
                        { actorId: 'npc_necromancer_1', role: 'necromancer' },
                    ],
                },
                true
            ),
            provider,
        },
    })
    room = game
    const savva = game.getCharacter('npc_necromancer_1')
    if (savva === undefined) {
        throw new Error('Missing Savva')
    }
    for (const character of game.charactersFor(savva)) {
        if (character.id !== savva.id) {
            character.tags.add('offline')
        }
    }
    const visitorSession = joinScenarioRoom(game, 'Тихий Гость')
    const { actor: visitor, sent } = visitorSession
    const navigation = game.navigationFor(savva)
    const neighbor = navigation.walkableNeighbors(
        navigation.worldToTile(savva.position)
    )[0]
    if (neighbor === undefined) {
        throw new Error('Lair placement is inaccessible')
    }
    visitor.locationId = savva.locationId
    visitor.position = navigation.tileToWorld(neighbor)
    visitor.hp = 9
    game.start()
    const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)
    const savvaId = savva.id
    function speech(): string[] {
        return sent.flatMap((message) =>
            message.type === 'event' &&
            message.event.kind === 'chat' &&
            message.event.actorId === savvaId &&
            message.event.text !== undefined
                ? [message.event.text]
                : []
        )
    }
    return { advance, game, savva, visitor, visitorSession, turns, speech }
}

it('keeps the local route moving during advice, then applies the selected plan and records it', async () => {
    const { advance, savva, visitor, turns, speech } = fixture()
    const start = { ...savva.position }
    await advance(150)
    expect(turns).toHaveLength(1)
    const turn = turns[0]
    if (turn === undefined) {
        throw new Error('Expected first advice turn')
    }
    expect(turn.context.playerHealth).toHaveLength(1)
    expect(turn.context.playerHealth[0]?.id).toBe(visitor.id)
    expect(turn.context.playerHealth[0]?.health.kind).toBe('percent')
    expect(turn.context.self.maxHp).toBe(savva.maxHp)
    expect(
        turn.context.options.some(({ tactic }) => tactic === 'offer_help')
    ).toBe(false)
    expect(savva.soul.controlSource).toBe('model')
    await advance(500)
    expect(savva.position).not.toEqual(start)
    expect(turns).toHaveLength(1)
    expect(speech()).toEqual(['Стой. Не подходи ближе к моему убежищу.'])
    const rest = turn.context.options.findIndex(
        ({ tactic }) => tactic === 'rest'
    )
    turn.resolve({ choice: rest, note: 'Вернусь к надгробной плите позже.' })
    await advance(500)
    expect(necromancerController(savva)?.journal).toEqual([
        expect.objectContaining({
            tactic: 'rest',
            note: 'Вернусь к надгробной плите позже.',
        }),
    ])
    expect(savva.soul.controlSource).toBe('script')
})

it('shares authored clues only after Savva reaches the corresponding landmark', async () => {
    const { advance, game, savva, turns } = fixture()
    const clues = (game.navigationFor(savva).grid.landmarks ?? [])
        .map(({ ashClue }) => ashClue)
        .filter((clue) => clue !== undefined)
    expect(clues).toHaveLength(3)
    expect(clues.join(' ')).toMatch(/Мирона.*Радомира.*Глеба.*колокол/u)

    await advance(150)
    const turn = turns[0]
    if (turn === undefined) {
        throw new Error('Expected first advice turn')
    }
    expect(turn.context.findings).toEqual([])
    turn.resolve({
        choice: turn.context.options.findIndex(
            ({ tactic }) => tactic === 'study'
        ),
        note: 'Проверю надгробную плиту.',
    })
    await advance(1_200)
    vi.setSystemTime(Date.now() + 300_000)
    await advance(350)
    expect(turns[1]?.context.findings).toEqual(clues.slice(0, 1))
})

it('gives the next tactical call only the fact that an earlier private reply went unheard', async () => {
    const dialogue = controlledNpcProvider()
    const { advance, game, savva, visitor, visitorSession, turns } = fixture(
        dialogue.decide
    )
    visitor.position = { ...savva.position }
    const privateQuestion = 'Я слышал про спрятанный перстень.'
    const privateReply = 'Я расскажу про перстень только тебе.'
    visitorSession.send({
        type: 'whisper',
        targetId: savva.id,
        text: privateQuestion,
    })
    await advance(150)
    expect(dialogue.turns).toHaveLength(1)
    expect(turns).toHaveLength(0)

    game.handleClose(visitorSession.socket)
    const bystander = joinScenarioRoom(game, 'Другой Гость')
    bystander.actor.locationId = savva.locationId
    bystander.actor.position = { ...savva.position }
    bystander.actor.hp = 9
    dialogue.turns[0]?.resolve(npcReply(null, { speech: privateReply }))
    await advance(350)

    expect(dialogue.turns[0]?.signal.aborted).toBe(true)
    expect(turns).toHaveLength(1)
    const tactical = turns[0]?.context
    expect(tactical?.conversationDepartures?.[0]).toMatchObject({
        npcId: savva.id,
        listenerId: visitor.id,
        listenerName: visitor.nickname,
    })
    expect(tactical?.playerHealth.map(({ id }) => id)).not.toContain(visitor.id)
    expect(JSON.stringify(tactical)).not.toContain(privateQuestion)
    expect(JSON.stringify(tactical)).not.toContain(privateReply)
    expect(JSON.stringify(visitorSession.sent)).not.toContain(privateReply)
    const published = JSON.stringify(bystander.sent)
    expect(published).not.toContain('conversationDepartures')
    expect(published).not.toContain(privateQuestion)
    expect(published).not.toContain(privateReply)
})

it('continues local combat while awaiting advice and speaks its bounded reply during a combat action', async () => {
    const { advance, game, savva, visitor, turns, speech } = fixture()
    visitor.hp = visitor.maxHp
    const slime = game
        .charactersFor(savva)
        .find(({ archetype }) => archetype === 'slime')
    const navigation = game.navigationFor(savva)
    const origin = navigation.worldToTile(savva.position)
    const spots = [
        { x: origin.x + 1, y: origin.y },
        { x: origin.x - 1, y: origin.y },
        { x: origin.x, y: origin.y + 1 },
        { x: origin.x, y: origin.y - 1 },
    ]
    const spot = spots.find(
        (tile) =>
            !navigation.isSolidTile(tile) &&
            navigation.hasLineOfSight(
                savva.position,
                navigation.tileToWorld(tile)
            )
    )
    if (slime === undefined || spot === undefined) {
        throw new Error('Combat fixture needs a reachable slime')
    }
    slime.position = navigation.tileToWorld(spot)
    slime.tags.delete('offline')
    const start = { ...savva.position }
    await advance(100)
    expect(turns).toHaveLength(1)
    expect(turns[0]?.context.phase).toBe('combat')
    expect(turns[0]?.context.scenario?.availableAbilities).toContain(
        'pray_grave'
    )
    const startedCombatAction = savva.isActionLocked(Date.now())
    const initialSlimeHp = slime.hp
    await advance(1_500)
    expect(turns).toHaveLength(1)
    expect(
        startedCombatAction ||
            savva.position.x !== start.x ||
            savva.position.y !== start.y ||
            slime.hp < initialSlimeHp
    ).toBe(true)
    const turn = turns[0]
    if (turn === undefined) {
        throw new Error('Expected battle advice')
    }
    visitor.position = { ...savva.position }
    const actionUntil = Date.now() + 4_000
    savva.lockAction(Date.now(), 4_000)
    const scenarioEdit = {
        kind: 'set_opening',
        distanceCells: 5,
        abilityId: 'pray_grave',
    } as const
    turn.resolve({
        choice: turn.context.options.findIndex(
            ({ tactic }) => tactic === 'hunt_slime'
        ),
        note: 'Слизень ещё рядом.',
        bark: 'warning',
        speech: 'Осторожно, слизень рядом с тропой.',
        scenarioEdit,
    })
    await advance(450)
    expect(necromancerController(savva)?.journal.at(-1)).toMatchObject({
        tactic: 'hunt_slime',
    })
    expect(speech()).toContain('Осторожно, слизень рядом с тропой.')
    expect(speech()).not.toContain('Слизень ещё рядом.')
    expect(savva.actionLockUntil).toBe(actionUntil)
    expect(
        necromancerController(savva)?.scenarioObservation(savva).opening
    ).toBeNull()
    expect(turns).toHaveLength(1)
    await advance(4_000)
    expect(
        necromancerController(savva)?.scenarioObservation(savva).opening
    ).toEqual(scenarioEdit)
})

it('validates model-authored speech separately from the private tactical note and tone', () => {
    expect(
        parseNecromancerDecision({ choice: 0, note: '', bark: 'cover' })
    ).toEqual({
        choice: 0,
        note: '',
        bark: 'cover',
    })
    expect(
        parseNecromancerDecision({
            choice: 0,
            note: '',
            bark: 'none',
            speech: 'Осторожно!',
        })
    ).toEqual({
        choice: 0,
        note: '',
        speech: 'Осторожно!',
    })
    expect(() =>
        parseNecromancerDecision({
            choice: 0,
            note: '',
            bark: 'Чужие HP и другие числа',
        })
    ).toThrow('Invalid necromancer decision')
    expect(() =>
        parseNecromancerDecision({
            choice: 0,
            note: '',
            scenarioEdit: {
                kind: 'set_opening',
                distanceCells: 5,
                abilityId: 'city_portal',
            },
        })
    ).toThrow('Invalid necromancer scenario edit')
})

it('walks away from an unengaged slime with an available hunter and leaves the skeleton idle', () => {
    const { game, savva, visitor } = fixture()
    const actors = game.charactersFor(savva)
    const slime = actors.find(({ archetype }) => archetype === 'slime')
    const skeleton = actors.find(
        (actor) =>
            actor.archetype === 'skeleton' &&
            ashSkeletonGuard(actor) === undefined
    )
    const navigation = game.navigationFor(savva)
    const origin = navigation.worldToTile(savva.position)
    const slimeTile = [
        { x: origin.x + 4, y: origin.y },
        { x: origin.x - 4, y: origin.y },
        { x: origin.x, y: origin.y + 4 },
        { x: origin.x, y: origin.y - 4 },
    ].find(
        (tile) =>
            navigation.hasLineOfSight(
                savva.position,
                navigation.tileToWorld(tile)
            ) && !navigation.isSolidTile(tile)
    )
    if (
        slime === undefined ||
        skeleton === undefined ||
        slimeTile === undefined
    ) {
        throw new Error(
            'Seeking distance needs two reachable creatures in the ruins'
        )
    }
    skeleton.position = { ...visitor.position }
    slime.position = navigation.tileToWorld(slimeTile)
    skeleton.tags.delete('offline')
    slime.tags.delete('offline')
    const now = Date.now()
    const scene = observeNecromancerScene(savva, game, now)
    expect(scene.threat?.id).toBe(slime.id)
    expect(availableSlimeHunter(savva, scene, now)).toEqual({
        tactic: 'hunt',
        targetId: skeleton.id,
    })
    defendNecromancer(savva, game, scene, slime, [], now)
    expect(ashSkeletonOrder(skeleton)).toBeUndefined()
    const destination = savva.remainingPath().at(-1)
    if (destination === undefined) {
        throw new Error('Expected an avoidance route')
    }
    expect(distance(destination, slime.position)).toBeGreaterThan(
        distance(savva.position, slime.position)
    )
})

it('aborts distant or dead advice and rejects a late reply for a previous life', async () => {
    const { advance, savva, turns } = fixture()
    await advance(150)
    const turn = turns[0]
    if (turn === undefined) {
        throw new Error('Expected first advice turn')
    }
    savva.applyDamage(savva.maxHp, Date.now())
    await advance(150)
    expect(turn.signal.aborted).toBe(true)
    turn.resolve({ choice: 0, note: 'Просроченный совет.' })
    await advance(150)
    expect(necromancerController(savva)?.journal).toEqual([])
})

it('permits two combat reviews with a 30-second minimum gap in one continuous encounter', () => {
    const { game, savva } = fixture()
    const threat = game
        .charactersFor(savva)
        .find(({ archetype }) => archetype === 'slime')
    if (threat === undefined) {
        throw new Error('Ruins need a hostile creature')
    }
    const planning = new NecromancerPlanning()
    const start = Date.now()
    const scene: NecromancerScene = {
        locationId: savva.locationId,
        deathSequence: savva.deathSequence,
        observedAt: start,
        visible: [threat],
        threat,
        corpseId: undefined,
        cover: undefined,
        playerId: undefined,
    }
    function observe(at: number) {
        scene.observedAt = at
        planning.observe(scene, at)
        return planning.due(savva, scene, 0, false, at)
    }
    function reserve(at: number) {
        planning.reserve(
            planning.offer(savva, game, scene, 'combat', 0, [], [], at)
        )
    }
    expect(observe(start)).toBe('combat')
    reserve(start)
    savva.hp = savva.maxHp * 0.4
    for (let at = start + 5_000; at < start + 30_000; at += 5_000) {
        expect(observe(at)).toBeUndefined()
    }
    expect(observe(start + 29_999)).toBeUndefined()
    expect(observe(start + 30_000)).toBe('combat')
    reserve(start + 30_000)
    for (let at = start + 35_000; at <= start + 65_000; at += 5_000) {
        expect(observe(at)).toBeUndefined()
    }
    expect(observe(start + 74_000)).toBe('combat')
})
