import { Actor, type Engine, ImageSource, vec } from 'excalibur'

import { characterCatalog, resolveAnimationRow } from '../assets/characterCatalog'
import { EngineAssetLoader } from '../runtime/engineRun'
import { renderExcaliburPreview } from './excaliburPreview'
import {
    addGrid,
    type CharacterPreviewOptions,
    createCanvas,
    createContainer,
    createFrameLabel,
    createSheet,
} from './renderExcaliburStory'

export function renderAllCharacterFrames(
    storyCanvas: HTMLElement,
    options: CharacterPreviewOptions
): HTMLElement {
    return renderExcaliburPreview(storyCanvas, () => {
        const definition = characterCatalog[options.character]
        const animation = definition.animations[options.action]
        const frameCount = animation?.frameCount ?? 1
        const cellWidth = definition.spriteWidth * options.zoom + 24
        const width = Math.max(420, 48 + cellWidth * frameCount)
        const height = 260
        const container = createContainer()
        const canvas = createCanvas(width, height)
        container.appendChild(canvas)

        const image = new ImageSource(definition.src)
        const loader = new EngineAssetLoader({ loadables: [image] })
        const addActors = (engine: Engine) => {
            const sheet = createSheet(definition, image)
            const row = resolveAnimationRow(animation, options.direction)

            engine.add(
                createFrameLabel(
                    `${definition.label} | ${options.action} | ${options.direction} | all frames`,
                    16,
                    28
                )
            )

            if (row === undefined || animation === undefined) {
                engine.add(createFrameLabel(`No ${options.action} animation`, 24, 80))
                return
            }

            for (let frame = 0; frame < animation.frameCount; frame += 1) {
                const x = 48 + frame * cellWidth + (definition.spriteWidth * options.zoom) / 2
                const y = 138
                const actor = new Actor({
                    anchor: vec(0.5, 0.75),
                    height: definition.spriteHeight,
                    pos: vec(x, y),
                    width: definition.spriteWidth,
                })

                actor.scale = vec(options.zoom, options.zoom)
                actor.graphics.use(sheet.getSprite(frame, row))
                actor.graphics.flipHorizontal = options.direction === 'left'
                engine.add(actor)

                if (options.showFrameGrid) {
                    addGrid(
                        engine,
                        x,
                        y - (definition.spriteHeight * options.zoom) / 2,
                        definition.spriteWidth * options.zoom,
                        definition.spriteHeight * options.zoom
                    )
                }

                engine.add(createFrameLabel(String(frame + 1), x - 4, 218))
            }
        }
        return { canvas, container, loader, addActors }
    })
}
