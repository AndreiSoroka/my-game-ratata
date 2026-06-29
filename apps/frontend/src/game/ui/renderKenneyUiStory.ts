import {
    kenneyBar,
    kenneyButton,
    kenneyRow,
    kenneyStack,
    kenneyStage,
    kenneyTitle,
    kenneyWindow,
    paragraph,
} from './kenneyUi'

export interface KenneyUiStoryArgs {
    label: string
    value: number
    width: number
}

export function renderButtonsStory(args: KenneyUiStoryArgs): HTMLElement {
    return storyStage('Kenney buttons', [buttonRow(args, undefined), buttonRow(args, args.width)])
}

export function renderWrappersStory(): HTMLElement {
    return storyStage('Kenney wrappers', [
        kenneyWindow({
            content: [],
        }),
        kenneyWindow({
            content: [],
            fixed: true,
            variant: 'metal',
        }),
        kenneyWindow({
            content: [textBlock('This text makes the wrapper expand around real content.')],
            variant: 'blue',
        }),
    ])
}

export function renderTitlesStory(args: KenneyUiStoryArgs): HTMLElement {
    return storyStage('Kenney titles', [
        titleRow(args.label),
        titleRow('Warning'),
        titleRow('Banner'),
    ])
}

export function renderBarsStory(args: KenneyUiStoryArgs): HTMLElement {
    const current = Math.min(Math.max(args.value, 0), 100)

    return storyStage('Kenney bars', [
        kenneyBar({ current, kind: 'hp', label: 'Health', max: 100 }),
        kenneyBar({ current: 64, kind: 'mana', label: 'Mana', max: 100 }),
        kenneyBar({ current: 42, kind: 'energy', label: 'Energy', max: 100 }),
    ])
}

export function renderWindowsStory(): HTMLElement {
    return storyStage('Kenney windows', [
        kenneyWindow({
            content: [
                textBlock('Find the lost key near the northern bridge. Return before nightfall.'),
                actionRow('Track Quest', 'Abandon'),
            ],
            fixed: true,
            title: 'Quest',
        }),
        kenneyWindow({
            content: [
                textBlock('Iron Sword'),
                textBlock('+4 damage. A plain blade, but balanced well enough.'),
                actionRow('Equip', 'Drop'),
            ],
            title: 'Item',
            variant: 'wood',
        }),
        kenneyWindow({
            content: [
                textBlock('The server will restart after this room empties.'),
                actionRow('Okay', 'More'),
            ],
            fixed: true,
            title: 'Warning',
            variant: 'metal',
        }),
    ])
}

function storyStage(label: string, content: Node[]): HTMLElement {
    const stage = kenneyStage(label)
    const stack = kenneyStack()
    stack.append(...content)
    stage.append(stack)

    return stage
}

function buttonRow(args: KenneyUiStoryArgs, width: number | undefined): HTMLElement {
    const row = kenneyRow()

    for (const variant of ['wood', 'red', 'metal'] as const) {
        row.append(kenneyButton({ label: args.label, variant, width }))
    }

    return row
}

function titleRow(text: string): HTMLElement {
    const row = kenneyRow()
    row.append(kenneyTitle(text), kenneyTitle(text, true))

    return row
}

function actionRow(primary: string, secondary: string): HTMLElement {
    const row = kenneyRow()
    row.append(
        kenneyButton({ label: primary, variant: 'red' }),
        kenneyButton({ label: secondary, variant: 'metal' })
    )

    return row
}

function textBlock(text: string): HTMLElement {
    return paragraph(text)
}
