import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { Color, type Engine, Font, Label, type PostUpdateEvent, vec } from 'excalibur'

import { tGame } from '@/shared/lib/i18n'

import { EFFECT_BUDGET } from './effectBudget'

interface StatusView {
    label: Label
    until: number
}
export class StatusViews {
    private now = 0
    private readonly views = new Map<string, StatusView>()
    private readonly font = new Font({
        size: 8,
        bold: true,
        color: Color.fromHex('#f5ca70'),
        family: 'system-ui',
        shadow: { color: Color.Black, offset: vec(1, 1), blur: 0 },
    })
    public constructor(private readonly engine: Engine) {
        engine.on('postupdate', this.update)
    }
    public sync(characters: CharacterSnapshot[]): void {
        const active = new Set<string>()
        for (const character of characters) {
            if (!character.alive || character.cooldowns.stunMsLeft <= 0) continue
            active.add(character.id)
            let view = this.views.get(character.id)
            if (!view && this.views.size < EFFECT_BUDGET.status) {
                const label = new Label({ font: this.font, text: '' })
                label.graphics.anchor = vec(0.5, 1)
                view = { label, until: 0 }
                this.views.set(character.id, view)
                this.engine.add(label)
            }
            if (view) {
                view.until = this.now + character.cooldowns.stunMsLeft
                view.label.pos = vec(character.position.x, character.position.y - 53)
                view.label.z = character.position.y + 31
                view.label.text = `${tGame('game.canvas.stun')} ${(character.cooldowns.stunMsLeft / 1000).toFixed(1)}`
            }
        }
        for (const [id, view] of this.views)
            if (!active.has(id)) {
                view.label.kill()
                this.views.delete(id)
            }
    }
    public clear(): void {
        for (const view of this.views.values()) view.label.kill()
        this.views.clear()
    }
    public dispose(): void {
        this.clear()
        this.engine.off('postupdate', this.update)
    }
    private readonly update = (event: PostUpdateEvent<Engine>): void => {
        this.now += Math.max(0, event.elapsed)
        for (const [id, view] of this.views) {
            const left = Math.max(0, view.until - this.now)
            if (left === 0) {
                view.label.kill()
                this.views.delete(id)
            } else view.label.text = `${tGame('game.canvas.stun')} ${(left / 1000).toFixed(1)}`
        }
    }
}
