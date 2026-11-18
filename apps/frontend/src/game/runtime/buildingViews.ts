import type { Vector2 } from '@my-game-ratata/contracts'
import { Actor, Canvas, Color, Engine, Font, Label, vec } from 'excalibur'

import { containsPosition, type MapBuilding } from './mapBuildings'

interface BuildingView {
    building: MapBuilding
    roof: Actor
    entry: Label
}

export class BuildingViews {
    private views: BuildingView[] = []
    private enteredId: string | undefined

    public constructor(private readonly engine: Engine) {}

    public setBuildings(buildings: MapBuilding[]): void {
        for (const view of this.views) {
            view.roof.kill()
            view.entry.kill()
        }
        this.enteredId = undefined
        this.views = buildings.map((building) => this.createView(building))
    }

    public update(playerPosition: Vector2 | undefined): void {
        this.enteredId =
            playerPosition === undefined
                ? undefined
                : this.views.find((view) => containsPosition(view.building, playerPosition))
                      ?.building.id
        for (const view of this.views) {
            const entered = view.building.id === this.enteredId
            view.roof.graphics.isVisible = !entered
            view.entry.graphics.isVisible =
                playerPosition !== undefined &&
                Math.hypot(
                    view.building.entry.x - playerPosition.x,
                    view.building.entry.y - playerPosition.y
                ) <= 72
            view.entry.text = entered ? 'Выход' : 'Вход'
        }
    }

    public hidesCharacter(position: Vector2): boolean {
        return this.views.some(
            (view) =>
                view.building.id !== this.enteredId && containsPosition(view.building, position)
        )
    }

    public coverStates(): { id: string; visible: boolean }[] {
        return this.views.map((view) => ({
            id: view.building.id,
            visible: view.roof.graphics.isVisible,
        }))
    }

    private createView(building: MapBuilding): BuildingView {
        const z = building.y + building.height - 1
        const roof = new Actor({
            anchor: vec(0, 0),
            pos: vec(building.x, building.y),
            width: building.width,
            height: building.height,
            z,
        })
        roof.graphics.use(
            new Canvas({
                width: building.width,
                height: building.height,
                cache: true,
                smoothing: false,
                draw: (context) => context.drawImage(building.cover, 0, 0),
            })
        )
        const entry = new Label({
            pos: vec(building.entry.x - 8, building.entry.y + 12),
            z: z + 1,
            text: 'Вход',
            font: new Font({
                size: 5,
                color: Color.fromHex('#fff2b5'),
                family: 'system-ui, sans-serif',
            }),
        })
        entry.graphics.isVisible = false
        this.engine.add(roof)
        this.engine.add(entry)
        return { building, roof, entry }
    }
}
