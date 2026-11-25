import {
    type AdventureClientMessage,
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
    FARM_PLOTS,
    type GameEventPayload,
    type WorkerWorkTarget,
    type WorkRequestSnapshot,
} from '@my-game-ratata/contracts'
import { expect } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import type { AdventureActionResult } from '../src/game/adventureTrading'
import { GameCharacter } from '../src/game/character'
import { EconomyWorkerController } from '../src/game/economyWorkers'
import { createItemInstance, equipDirect } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { findVisibleTarget } from '../src/game/queries'
import type { GameRoom } from '../src/game/room'
import { WorkerRequestService } from '../src/game/workerRequests'
import type { WorkerJob } from '../src/game/workerSpawns'
import { WorldLocations } from '../src/game/worldLocations'

export class WorkerSimulation {
    public now = 0
    public readonly world: WorldLocations
    public readonly adventure: AdventureService
    public readonly requests = new WorkerRequestService()
    public readonly characters = new Map<string, GameCharacter>()
    public readonly worker: GameCharacter
    public readonly enemy: GameCharacter
    public readonly clerk: GameCharacter
    public readonly player: GameCharacter
    public readonly node: AdventureResourceNode
    public readonly worksite: WorkerWorkTarget
    public readonly room: GameRoom
    public movedPixels = 0
    public readonly reports: GameEventPayload[] = []
    public readonly commands: Array<{
        message: AdventureClientMessage
        result: AdventureActionResult
        locationId: string
        permitted: boolean
    }> = []
    private readonly controller: EconomyWorkerController

    public constructor(
        job: WorkerJob,
        options: {
            scrap?: boolean
            sourceRemaining?: number
            additionalSources?: AdventureResourceNode[]
            attackPosition?: { x: number; y: number }
        } = {}
    ) {
        const navigation = new NavigationService({
            id: 'worker-request-fixture',
            width: 96,
            height: 80,
            tileWidth: 16,
            tileHeight: 16,
            solidLayerNames: [],
            solid: Array<boolean>(96 * 80).fill(false),
        })
        this.world = new WorldLocations(navigation)
        const plot = FARM_PLOTS.find((entry) => entry.locationId === 'map-2-1')
        if (plot === undefined) {
            throw new Error('Missing authored farm')
        }
        this.node = createResource(job, plot, options)
        this.worksite = {
            kind: job === 'farmer' ? 'farm' : 'resource',
            sourceId: job === 'farmer' ? plot.id : this.node.id,
            locationId: plot.locationId,
            position: { ...plot.position },
        }
        this.adventure = new AdventureService({
            now: () => this.now,
            farmRandom: () => 0,
            resourceNodes:
                job === 'farmer'
                    ? []
                    : [this.node, ...(options.additionalSources ?? [])],
            worldObjects: [],
        })
        this.worker = actor(
            'worker',
            plot.locationId,
            options.attackPosition ?? {
                x: plot.position.x + 32,
                y: plot.position.y,
            }
        )
        this.worker.tags.add(`worker.${job}`)
        this.worker.tags.add(`worker.city.${CENTER_LOCATION_ID}`)
        equipDirect(
            this.worker.equipment,
            createItemInstance(job === 'miner' ? 'pickaxe' : 'axe')
        )
        this.enemy = actor(
            'enemy',
            plot.locationId,
            { x: this.worker.position.x + 32, y: this.worker.position.y },
            'skeleton'
        )
        this.clerk = actor('npc_friendly_girl_1', CENTER_LOCATION_ID, {
            x: 768,
            y: 56,
        })
        this.player = actor(
            'hero',
            CENTER_LOCATION_ID,
            this.clerk.position,
            'player'
        )
        for (const character of [
            this.worker,
            this.enemy,
            this.clerk,
            this.player,
            actor('npc_merchant_1', CENTER_LOCATION_ID, this.clerk.position),
        ]) {
            this.characters.set(character.id, character)
        }
        this.controller = new EconomyWorkerController(job)
        this.room = this.createRoom()
    }

    private createRoom(): GameRoom {
        return {
            workerRequests: this.requests,
            adventureForWorkers: () => this.adventure,
            navigationFor: ({
                locationId,
            }: Pick<GameCharacter, 'locationId'>) =>
                this.world.get(locationId).navigation,
            getCharacter: (id: string) => this.characters.get(id),
            findVisibleTarget: (
                observer: GameCharacter,
                radius: number,
                now: number
            ) =>
                findVisibleTarget(
                    this.characters.values(),
                    this.world.get(observer.locationId).navigation,
                    observer,
                    radius,
                    now
                ),
            requestAdventure: (
                worker: GameCharacter,
                message: AdventureClientMessage,
                now: number
            ) => {
                const permitted = this.requests.allowsWork(worker.id, message)
                const result = permitted
                    ? this.adventure.handleResult(
                          worker,
                          message,
                          [...this.characters.values()],
                          this.world.get(worker.locationId).navigation,
                          now
                      )
                    : {
                          accepted: false,
                          error: 'Работник ожидает помощи.',
                          events: [],
                      }
                this.commands.push({
                    message,
                    result,
                    locationId: worker.locationId,
                    permitted,
                })
                return result
            },
            publishEvents: (events: GameEventPayload[]) => {
                this.reports.push(
                    ...events.filter(({ kind }) => kind === 'chat')
                )
            },
        } as unknown as GameRoom
    }

    public prepareFarm(phase: 'bare' | 'growing'): void {
        for (const plot of this.adventure.farmSnapshot(
            this.worksite.locationId,
            this.now
        )) {
            const farmer = actor(
                `fixture-farmer-${plot.id}`,
                plot.locationId,
                plot.position
            )
            const command = (action: 'harvest' | 'sow') =>
                this.adventure.handleResult(
                    farmer,
                    { type: 'farm_action', plotId: plot.id, action },
                    [farmer],
                    this.world.get(plot.locationId).navigation,
                    this.now
                )
            if (plot.phase === 'ripe') {
                expect(command('harvest').accepted).toBe(true)
            }
            if (phase === 'growing') {
                farmer.inventory.push(createItemInstance('wheat_seed'))
                expect(
                    this.adventure.handleResult(
                        farmer,
                        { type: 'farm_action', plotId: plot.id, action: 'sow' },
                        [farmer],
                        this.world.get(plot.locationId).navigation,
                        this.now + 800
                    ).accepted
                ).toBe(true)
            }
        }
    }

    public current(): WorkRequestSnapshot {
        const request = this.requests.snapshot('worker-request-1')
        if (request === null) {
            throw new Error('Missing fixture request')
        }
        return request
    }

    public tick(): void {
        this.now += 50
        this.adventure.update(
            this.now,
            (id) => this.world.get(id).navigation,
            this.characters.values()
        )
        this.requests.reconcile(this.characters, this.now)
        this.controller.update(this.worker, this.room, this.now)
        const point = this.worker.nextPathPoint()
        const input = this.worker.getMoveInput()
        const intent =
            input.x !== 0 || input.y !== 0 || point === undefined
                ? input
                : {
                      x: point.x - this.worker.position.x,
                      y: point.y - this.worker.position.y,
                  }
        const before = { ...this.worker.position }
        advanceCharacter({
            character: this.worker,
            now: this.now,
            deltaMs: 50,
            navigation: this.world.get(this.worker.locationId).navigation,
        })
        this.movedPixels += Math.hypot(
            this.worker.position.x - before.x,
            this.worker.position.y - before.y
        )
        this.world.travel(this.worker, intent, this.now)
    }

    public until(predicate: () => boolean): void {
        for (let tick = 0; tick < 3500; tick += 1) {
            if (predicate()) {
                return
            }
            this.tick()
        }
        throw new Error(
            `Fixture deadline: ${JSON.stringify(this.current())} position=${JSON.stringify(this.worker.position)}`
        )
    }

    public publish(): void {
        this.tick()
        this.enemy.alive = false
        this.until(() => this.requests.list().length === 1)
    }

    public accept(): void {
        expect(
            this.requests.accept(
                this.current().id,
                'solo:hero',
                new Set([this.player.id]),
                this.characters,
                this.now
            )
        ).toBeNull()
    }

    public report(): string | null {
        return this.requests.report(
            this.current().id,
            'solo:hero',
            this.player,
            this.room,
            this.now
        )
    }

    public stock(itemId: 'wood'): number {
        return (
            this.adventure.economy
                .snapshot(CENTER_LOCATION_ID, this.now)
                ?.rows.find((row) => row.itemId === itemId)?.stock ?? 0
        )
    }
}

function actor(
    id: string,
    locationId: string,
    position: { x: number; y: number },
    kind: 'human' | 'skeleton' | 'player' = 'human'
): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        locationId,
        spawnPosition: { ...position },
        archetype: kind === 'skeleton' ? 'skeleton' : 'human',
        controllerKind: kind === 'player' ? 'network_player' : 'scripted',
        faction: kind === 'skeleton' ? 'monsters' : 'peaceful',
        mortal: true,
    })
}

function createResource(
    job: WorkerJob,
    plot: { locationId: string; position: { x: number; y: number } },
    options: { scrap?: boolean; sourceRemaining?: number }
): AdventureResourceNode {
    const node: AdventureResourceNode = {
        id: 'work-resource',
        kind: job === 'miner' ? 'stone' : 'wood',
        source: job === 'miner' ? 'stone' : 'tree',
        phase: 'ready',
        remaining: options.sourceRemaining ?? 8,
        locationId: plot.locationId,
        position: { ...plot.position },
        bounds: {
            x: plot.position.x - 8,
            y: plot.position.y - 16,
            width: 16,
            height: 16,
        },
        collisionBounds: {
            x: plot.position.x - 8,
            y: plot.position.y - 16,
            width: 16,
            height: 16,
        },
    }
    if (options.scrap === true) {
        node.kind = 'scrap'
        delete node.source
        delete node.bounds
        delete node.collisionBounds
    }
    return node
}
