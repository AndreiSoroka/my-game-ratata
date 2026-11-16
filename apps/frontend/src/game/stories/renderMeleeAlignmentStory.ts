import {
    ABILITY_DEFINITIONS,
    type AttackZone,
    type CharacterFacing,
} from '@my-game-ratata/contracts'
import { Actor, Color, type Engine, ImageSource, Loader, type SpriteSheet, vec } from 'excalibur'

import { characterCatalog, resolveAnimationRow } from '../assets/characterCatalog'
import { AttackZoneViews } from '../runtime/attackZoneViews'
import { createBundle } from '../runtime/characterViewBundle'
import { combatEffectCues } from '../runtime/combatEffectPlan'
import { combatEffectPose } from '../runtime/combatEffectPose'
import { EffectGraphics } from '../runtime/effectGraphics'
import { characterFixture } from '../testing/characterFixture'
import { createCanvas, createEngine, createSheet, markCanvasReady } from './renderExcaliburStory'

type MeleeKind = 'slash' | 'bone'
interface DirectionFixture {
    facing: CharacterFacing
    label: string
    bounds: Omit<AttackZone, 'ownerId'>
}

/** Authored server-example fixtures for this preview only; no client combat rules. */
function directionFixtures(range: number): DirectionFixture[] {
    return [
        { facing: 'right', label: 'Вправо', bounds: { minX: 0, maxX: range, minY: -16, maxY: 16 } },
        { facing: 'down', label: 'Вниз', bounds: { minX: -16, maxX: 16, minY: 0, maxY: range } },
        { facing: 'left', label: 'Влево', bounds: { minX: -range, maxX: 0, minY: -16, maxY: 16 } },
        { facing: 'up', label: 'Вверх', bounds: { minX: -16, maxX: 16, minY: -range, maxY: 0 } },
    ]
}

export function renderMeleeAlignmentStory(kind: MeleeKind): HTMLElement {
    const definition = characterCatalog[kind === 'bone' ? 'skeleton' : 'player']
    const fixtures = directionFixtures(
        kind === 'bone' ? ABILITY_DEFINITIONS.skeleton_strike.range : 14.4
    )
    const panel = document.createElement('section')
    panel.className = 'rpg-panel melee-alignment-preview'
    Object.assign(panel.style, {
        width: '960px',
        maxWidth: '100%',
        padding: '20px',
        boxSizing: 'border-box',
    })
    const canvas = createCanvas(320, 96)
    Object.assign(canvas.style, { width: '100%', height: 'auto' })
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'Персонаж, область удара и эффект в четырёх направлениях')
    const labels = document.createElement('div')
    Object.assign(labels.style, {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        textAlign: 'center',
    })
    for (const { label } of fixtures) {
        const caption = document.createElement('span')
        caption.textContent = label
        labels.append(caption)
    }
    const legend = document.createElement('p')
    legend.textContent =
        'Белая точка — опора персонажа и удара. Жёлтый прямоугольник — пример серверной области атаки.'
    panel.append(canvas, labels, legend)
    const engine = createEngine(canvas, 320, 96)
    const image = new ImageSource(definition.src)
    const graphics = new EffectGraphics()
    let attached = false
    let disposed = false
    const observer = new MutationObserver(() => {
        if (panel.isConnected) attached = true
        else if (attached) {
            disposed = true
            engine.stop()
            graphics.clear()
            observer.disconnect()
        }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    void engine.start(new Loader([image])).then(() => {
        if (disposed) {
            engine.stop()
            return
        }
        const sheet = createSheet(definition, image)
        const zones = fixtures.map((fixture, index) =>
            addMeleeExample(engine, sheet, graphics, kind, fixture, index)
        )
        new AttackZoneViews(engine).update(zones)
        markCanvasReady(canvas)
    })
    return panel
}

function addMeleeExample(
    engine: Engine,
    sheet: SpriteSheet,
    graphics: EffectGraphics,
    kind: MeleeKind,
    fixture: DirectionFixture,
    index: number
): AttackZone {
    const source = characterFixture(`melee-preview-${String(index)}`, {
        position: { x: 40 + index * 80, y: 54 },
        facing: fixture.facing,
        visualId: kind === 'bone' ? 'skeleton' : 'player',
    })
    const body = createBundle().body
    body.pos = vec(source.position.x, source.position.y)
    const definition = characterCatalog[kind === 'bone' ? 'skeleton' : 'player']
    const row = resolveAnimationRow(definition.animations.attack, fixture.facing)!
    body.graphics.use(sheet.getSprite(1, row))
    body.graphics.flipHorizontal = fixture.facing === 'left'
    engine.add(body)
    const [cue] = combatEffectCues(
        {
            kind: 'attack',
            actorId: source.id,
            ...(kind === 'bone' ? { abilityId: 'skeleton_strike' as const } : {}),
        },
        source
    )
    const pose = combatEffectPose(cue!, source, source, false)
    const effect = new Actor({
        anchor: vec(0.5, 0.5),
        pos: vec(pose.x, pose.y),
        rotation: pose.rotation,
        z: pose.z,
    })
    effect.graphics.use(graphics.get(cue!.kind))
    engine.add(effect)
    engine.add(
        new Actor({ pos: body.pos.clone(), width: 2, height: 2, color: Color.White, z: 600 })
    )
    const { x, y } = source.position
    return {
        ownerId: source.id,
        minX: x + fixture.bounds.minX,
        maxX: x + fixture.bounds.maxX,
        minY: y + fixture.bounds.minY,
        maxY: y + fixture.bounds.maxY,
    }
}
import './meleeAlignmentStory.css'
