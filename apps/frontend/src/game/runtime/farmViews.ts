import type { FarmPlotSnapshot } from '@my-game-ratata/contracts'
import { Actor, Color, Engine, Font, ImageSource, Label, SpriteSheet, vec } from 'excalibur'

import { tGame } from '@/shared/lib/i18n'

interface FarmView {
    actor: Actor
    label: Label
}

export class FarmViews {
    private readonly views = new Map<string, FarmView>()
    private readonly sheet: SpriteSheet
    public constructor(
        private readonly engine: Engine,
        image: ImageSource
    ) {
        this.sheet = SpriteSheet.fromImageSource({
            image,
            grid: { columns: 12, rows: 11, spriteWidth: 16, spriteHeight: 16 },
        })
    }
    public update(plots: FarmPlotSnapshot[], serverTime: number): void {
        const ids = new Set(plots.map((plot) => plot.id))
        for (const [id, view] of this.views) {
            if (!ids.has(id)) {
                view.actor.kill()
                view.label.kill()
                this.views.delete(id)
            }
        }
        for (const plot of plots) {
            const view = this.views.get(plot.id) ?? this.createView(plot)
            const remaining = Math.max(0, plot.readyAt - serverTime)
            const tile = plot.phase === 'ripe' ? 68 : remaining <= 22_500 ? 66 : 65
            view.actor.graphics.use(this.sheet.getSprite(tile % 12, Math.floor(tile / 12)))
            view.actor.graphics.isVisible = plot.phase !== 'bare'
            view.label.text =
                plot.phase === 'bare'
                    ? tGame('game.canvas.barePlot')
                    : plot.phase === 'ripe'
                      ? tGame('game.canvas.ripeWheat')
                      : tGame('game.canvas.growingWheat', { seconds: Math.ceil(remaining / 1000) })
            view.label.color = Color.fromHex(plot.phase === 'ripe' ? '#ffe19a' : '#d2dec4')
        }
    }
    private createView(plot: FarmPlotSnapshot): FarmView {
        const actor = new Actor({
            pos: vec(plot.position.x, plot.position.y),
            anchor: vec(0.5, 0.75),
            z: plot.position.y,
        })
        const label = new Label({
            pos: vec(plot.position.x - 21, plot.position.y - 18),
            z: plot.position.y + 1,
            text: '',
            font: new Font({ size: 5, color: Color.White, family: 'system-ui, sans-serif' }),
        })
        const view = { actor, label }
        this.engine.add(actor)
        this.engine.add(label)
        this.views.set(plot.id, view)
        return view
    }
}
