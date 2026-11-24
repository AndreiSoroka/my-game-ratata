import { Color, type DefaultLoader, DisplayMode, type Engine } from 'excalibur'

import { createWebglEngine, EngineRun } from '../runtime/engineRun'

interface PreviewContent {
    container: HTMLElement
    canvas: HTMLCanvasElement
    loader: DefaultLoader
    addActors: (engine: Engine) => void
    cleanup?: () => void
}

const previews = new WeakMap<HTMLElement, ExcaliburPreview>()

export function renderExcaliburPreview(
    storyCanvas: HTMLElement,
    createContent: () => PreviewContent
): HTMLElement {
    let preview = previews.get(storyCanvas)
    if (preview === undefined) {
        preview = new ExcaliburPreview()
        previews.set(storyCanvas, preview)
    }
    return preview.render(createContent)
}

class ExcaliburPreview {
    private readonly host = document.createElement('div')
    private run: EngineRun | undefined
    private released: Promise<void> | undefined
    private revision = 0
    private readonly observer = new MutationObserver(() => {
        if (this.host.isConnected) return
        this.observer.disconnect()
        this.revision += 1
        this.releaseRun()
    })

    public constructor() {
        this.host.style.display = 'contents'
    }

    public render(createContent: () => PreviewContent): HTMLElement {
        const revision = ++this.revision
        this.releaseRun()
        void this.renderLatest(revision, createContent)
        // Storybook reuses this node when the Controls change.
        return this.host
    }

    private releaseRun(): void {
        if (this.run) this.released = this.run.cancel()
        this.run = undefined
    }

    private async renderLatest(
        revision: number,
        createContent: () => PreviewContent
    ): Promise<void> {
        await this.released
        if (!this.isCurrent(revision)) return
        this.observer.observe(this.host.ownerDocument, { childList: true, subtree: true })
        try {
            const { container, canvas, loader, addActors, cleanup } = createContent()
            this.host.replaceChildren(container)
            const run = new EngineRun(canvas, () =>
                createWebglEngine({
                    backgroundColor: Color.fromHex('#101217'),
                    canvasElement: canvas,
                    displayMode: DisplayMode.Fixed,
                    height: canvas.height,
                    suppressPlayButton: true,
                    width: canvas.width,
                })
            )
            this.run = run
            if (cleanup) run.addCleanup(cleanup)
            if (!(await run.start(loader)) || !run.active || !this.isCurrent(revision)) return
            addActors(run.engine)
            const firstFrame = run.engine.once('postframe', () => {
                if (this.isCurrent(revision)) canvas.dataset.galleryReady = 'true'
            })
            run.addCleanup(() => firstFrame.close())
        } catch (error) {
            if (!this.isCurrent(revision)) return
            this.releaseRun()
            const message = document.createElement('p')
            message.setAttribute('role', 'alert')
            message.textContent =
                error instanceof Error ? error.message : 'Excalibur preview failed to start'
            this.host.replaceChildren(message)
        }
    }

    private isCurrent(revision: number): boolean {
        return revision === this.revision && this.host.isConnected
    }
}
