import {
    Actor,
    Animation,
    AnimationStrategy,
    Color,
    DisplayMode,
    Engine,
    Flags,
    ImageSource,
    Label,
    Loader,
    range,
    SpriteSheet,
    vec,
} from 'excalibur'

import {
    type CharacterAction,
    characterCatalog,
    type CharacterDefinition,
    type CharacterDirection,
    type CharacterId,
    characterIds,
    clampFrame,
    resolveAnimationRow,
    supportsDirection,
} from '../assets/characterCatalog'

Flags.useCanvasGraphicsContext()

export interface CharacterPreviewOptions {
    action: CharacterAction
    animate: boolean
    character: CharacterId
    direction: CharacterDirection
    frame: number
    showFrameGrid: boolean
    zoom: number
}

export type CharacterOverviewOptions = Omit<CharacterPreviewOptions, 'character'>

let activeEngine: Engine | undefined

export function createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.style.display = 'block'
    canvas.style.width = `${String(width)}px`
    canvas.style.height = `${String(height)}px`
    canvas.style.imageRendering = 'pixelated'
    canvas.style.maxWidth = '100%'
    canvas.dataset.galleryReady = 'false'

    return canvas
}

export function markCanvasReady(canvas: HTMLCanvasElement): void {
    canvas.dataset.galleryReady = 'true'
}

export function createContainer(): HTMLDivElement {
    const container = document.createElement('div')
    container.style.alignItems = 'center'
    container.style.background = '#15171c'
    container.style.boxSizing = 'border-box'
    container.style.color = '#f5f7fb'
    container.style.display = 'flex'
    container.style.flexDirection = 'column'
    container.style.fontFamily =
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    container.style.gap = '12px'
    container.style.minHeight = '100vh'
    container.style.padding = '24px'

    return container
}

function stopActiveEngine(): void {
    if (activeEngine !== undefined) {
        activeEngine.stop()
        activeEngine = undefined
    }
}

export function createSheet(definition: CharacterDefinition, image: ImageSource): SpriteSheet {
    return SpriteSheet.fromImageSource({
        image,
        grid: {
            columns: definition.columns,
            rows: definition.rows,
            spriteHeight: definition.spriteHeight,
            spriteWidth: definition.spriteWidth,
        },
    })
}

export function createFrameLabel(text: string, x: number, y: number): Label {
    return new Label({
        color: Color.fromHex('#d9e0ee'),
        pos: vec(x, y),
        text,
    })
}

function loadCharacterImages(definitions: CharacterDefinition[]): {
    images: ImageSource[]
    loader: Loader
} {
    const images = definitions.map((definition) => new ImageSource(definition.src))

    return {
        images,
        loader: new Loader(images),
    }
}

export function addGrid(engine: Engine, x: number, y: number, width: number, height: number): void {
    const border = new Actor({
        color: Color.fromHex('#5d6472'),
        height,
        pos: vec(x, y),
        width,
        z: -1,
    })

    border.graphics.opacity = 0.16
    engine.add(border)
}

function addSpriteActor(
    engine: Engine,
    definition: CharacterDefinition,
    sheet: SpriteSheet,
    options: CharacterOverviewOptions,
    position: ReturnType<typeof vec>
): void {
    const animation = definition.animations[options.action]
    const row = resolveAnimationRow(animation, options.direction)
    const actor = new Actor({
        anchor: vec(0.5, 0.75),
        height: definition.spriteHeight,
        pos: position,
        width: definition.spriteWidth,
    })

    actor.scale = vec(options.zoom, options.zoom)

    if (row === undefined || animation === undefined) {
        engine.add(
            createFrameLabel(`${definition.label}: no ${options.action}`, position.x - 44, 36)
        )
        return
    }

    if (options.animate) {
        const frameIndexes = range(
            row * definition.columns,
            row * definition.columns + animation.frameCount - 1
        )
        const graphic = Animation.fromSpriteSheet(
            sheet,
            frameIndexes,
            animation.frameMs,
            AnimationStrategy.Loop
        )
        actor.graphics.use(graphic)
    } else {
        actor.graphics.use(sheet.getSprite(clampFrame(animation, options.frame), row))
    }

    actor.graphics.flipHorizontal = options.direction === 'left'
    engine.add(actor)

    if (options.showFrameGrid) {
        addGrid(
            engine,
            position.x,
            position.y - (definition.spriteHeight * options.zoom) / 2,
            definition.spriteWidth * options.zoom,
            definition.spriteHeight * options.zoom
        )
    }
}

function addCharacterActor(
    engine: Engine,
    definition: CharacterDefinition,
    options: CharacterPreviewOptions,
    position = vec(160, 140)
): void {
    const image = new ImageSource(definition.src)
    const loader = new Loader([image])

    void engine.start(loader).then(() => {
        const sheet = createSheet(definition, image)
        const animation = definition.animations[options.action]
        const row = resolveAnimationRow(animation, options.direction)
        const actor = new Actor({
            anchor: vec(0.5, 0.75),
            height: definition.spriteHeight,
            pos: position,
            width: definition.spriteWidth,
        })

        actor.scale = vec(options.zoom, options.zoom)

        if (row === undefined || animation === undefined) {
            const label = createFrameLabel(
                `${definition.label}: no ${options.action} animation`,
                24,
                32
            )
            engine.add(label)
            markCanvasReady(engine.canvas)
            return
        }

        if (options.animate) {
            const frameIndexes = range(
                row * definition.columns,
                row * definition.columns + animation.frameCount - 1
            )
            const graphic = Animation.fromSpriteSheet(
                sheet,
                frameIndexes,
                animation.frameMs,
                AnimationStrategy.Loop
            )
            actor.graphics.use(graphic)
        } else {
            const clampedFrame = clampFrame(animation, options.frame)
            actor.graphics.use(sheet.getSprite(clampedFrame, row))
        }

        actor.graphics.flipHorizontal = options.direction === 'left'
        engine.add(actor)

        if (options.showFrameGrid) {
            addGrid(
                engine,
                position.x,
                position.y - (definition.spriteHeight * options.zoom) / 2,
                definition.spriteWidth * options.zoom,
                definition.spriteHeight * options.zoom
            )
        }

        const labelParts = [
            definition.label,
            options.action,
            options.direction,
            `frame ${String(clampFrame(animation, options.frame) + 1)}/${String(animation.frameCount)}`,
        ]
        const unsupportedDirection = !supportsDirection(animation, options.direction)
        const label = createFrameLabel(
            unsupportedDirection
                ? `${labelParts.join(' | ')} | direction previewed as down`
                : labelParts.join(' | '),
            16,
            24
        )
        engine.add(label)
        markCanvasReady(engine.canvas)
    })
}

export function createEngine(canvas: HTMLCanvasElement, width: number, height: number): Engine {
    stopActiveEngine()

    activeEngine = new Engine({
        backgroundColor: Color.fromHex('#101217'),
        canvasElement: canvas,
        displayMode: DisplayMode.Fixed,
        height,
        pixelArt: true,
        suppressPlayButton: true,
        width,
    })

    return activeEngine
}

export function renderCharacterFrame(options: CharacterPreviewOptions): HTMLElement {
    const width = 420
    const height = 320
    const container = createContainer()
    const canvas = createCanvas(width, height)
    container.appendChild(canvas)

    const engine = createEngine(canvas, width, height)
    addCharacterActor(engine, characterCatalog[options.character], options)

    return container
}

export function renderAllCharacters(zoom: number): HTMLElement {
    return renderAllCharacterOverview({
        action: 'idle',
        animate: false,
        direction: 'down',
        frame: 0,
        showFrameGrid: true,
        zoom,
    })
}

export function renderAllCharacterOverview(options: CharacterOverviewOptions): HTMLElement {
    const width = 420
    const height = 300
    const container = createContainer()
    const canvas = createCanvas(width, height)
    container.appendChild(canvas)

    const engine = createEngine(canvas, width, height)
    const definitions = characterIds.map((characterId) => characterCatalog[characterId])
    const { images, loader } = loadCharacterImages(definitions)

    void engine.start(loader).then(() => {
        definitions.forEach((definition, index) => {
            const image = images[index]
            if (image === undefined) {
                return
            }

            const sheet = createSheet(definition, image)
            const x = 60 + index * 100
            addSpriteActor(engine, definition, sheet, options, vec(x, 135))
            engine.add(createFrameLabel(definition.label, x - 44, 225))
        })
        markCanvasReady(canvas)
    })

    return container
}
