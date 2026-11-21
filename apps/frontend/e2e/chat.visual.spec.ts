import { expect, type Page, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

const historyStory = 'entities-chats-chathistorypanel'
const composerStory = 'entities-chats-chatcomposer'
const widgetStory = 'widgets-chats-chatwidget'
const toolbarName = 'Каналы чата'
const historyName = 'История чата'
const listName = 'Услышанные реплики'
const draftName = 'Сообщение в чат'

for (const width of [1280, 320]) {
    test(`ChatHistoryPanel Default at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(uiStoryUrl(`${historyStory}--default`))
        const history = page.getByRole('complementary', { name: historyName })
        await expect(history.locator('[data-fantasy-border="border-006"]')).toBeVisible()
        const list = history.getByRole('list', { name: listName })
        await expect(list.getByRole('listitem')).toHaveCount(3)
        await expect(list).toContainText('Встретимся у северных ворот.')
        await expect(list).toContainText('Шёпот · Лада')
        await expect(list).toContainText('Поручение принято')
        await readyUiStory(page)
        await expectUiFits(history, width)
        await expect(history).toHaveScreenshot(`chat-history-default-${width}.png`)
    })

    test(`ChatComposer edits Cyrillic text at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(uiStoryUrl(`${composerStory}--default`))
        const composer = page.locator('#storybook-root > div > *')
        const field = composer.locator('.ui-input')
        const draft = field.getByRole('textbox', { name: draftName })
        await expect(draft).toBeEditable()
        await draft.fill('')
        await page.keyboard.insertText('Привет, Мира!')
        await expect(draft).toBeFocused()
        await expect(page.locator('#storybook-root [data-fantasy-border]')).toHaveCount(0)
        await expect(field).toHaveCSS('outline-style', 'none')
        await expect(field).toHaveCSS('box-shadow', 'none')
        await expect(draft).toHaveValue('Привет, Мира!')
        await expect(composer.getByText(/13\s*\/\s*400/)).toBeVisible()
        await readyUiStory(page)
        await expectUiFits(composer, width)
        await expect(composer).toHaveScreenshot(`chat-composer-typing-${width}.png`)
    })

    test(`ChatWidget combines history and editor at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(uiStoryUrl(`${widgetStory}--default`))
        const widget = page.locator('#storybook-root > div > *')
        const frame = widget.locator('.hud-frame__border')
        const toolbar = frame.getByRole('navigation', { name: toolbarName })
        const history = frame.getByRole('complementary', { name: historyName })
        const field = frame.locator('.chat-composer-frame')
        const draft = field.getByRole('textbox', { name: draftName })
        const collapse = frame.getByRole('button', { name: 'Свернуть историю чата' })
        await expect(frame).toHaveCount(1)
        await expect(frame).toHaveAttribute('data-fantasy-border', 'border-006')
        await expect(field.locator('[data-fantasy-border="border-006"]')).toBeVisible()
        await expect(toolbar).toBeVisible()
        await expect(
            frame.locator('.chat-frame__toolbar [data-fantasy-panel="panel-001"]')
        ).toHaveCount(4)
        await expect(frame.locator('[data-fantasy-divider]')).toHaveCount(0)
        await expect(history.getByRole('list', { name: listName })).toBeVisible()
        await expect(draft).toHaveValue('Я уже в пути.')
        await readyUiStory(page)
        await expectUiFits(widget, width)
        const [toolbarBox, collapseBox, historyBox, fieldBox] = await Promise.all([
            toolbar.boundingBox(),
            collapse.boundingBox(),
            history.boundingBox(),
            field.boundingBox(),
        ])
        expect(collapseBox!.y).toBe(toolbarBox!.y)
        expect(historyBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height)
        expect(fieldBox!.y).toBeGreaterThanOrEqual(historyBox!.y + historyBox!.height)
        await expect(widget).toHaveScreenshot(`chat-widget-default-${width}.png`)
    })
}

test('ChatWidget switches channels and collapses without losing the selection', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${widgetStory}--reading`))
    const list = page.getByRole('list', { name: listName })
    const toolbar = page.getByRole('navigation', { name: toolbarName })
    const nearby = toolbar.getByRole('button', { name: 'Рядом', exact: true })
    const personal = toolbar.getByRole('button', { name: 'Личные', exact: true })
    await personal.click()
    await expect(personal).toHaveAttribute('aria-pressed', 'true')
    await expect(list).toContainText('Карту оставила у фонаря.')
    await expect(list).toContainText('Поручение принято')
    await expect(list).not.toContainText('Встретимся у ворот.')
    await nearby.click()
    await expect(nearby).toHaveAttribute('aria-pressed', 'true')
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await page.getByRole('button', { name: 'Свернуть историю чата' }).click()
    await expect(list).toBeHidden()
    await expect(toolbar).toHaveCount(0)
    await expect(page.locator('.chat-history__preview')).toContainText('Встретимся у ворот.')
    await page.getByRole('button', { name: 'Развернуть историю чата' }).click()
    await expect(list).toBeVisible()
    await expect(nearby).toHaveAttribute('aria-pressed', 'true')
})

async function openNarrowHistory(page: Page, state: string) {
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto(uiStoryUrl(`${historyStory}--${state}`))
    const history = page.getByRole('complementary', { name: historyName })
    await expect(history).toBeVisible()
    await readyUiStory(page)
    await expectUiFits(history, 320)
    return { history, list: history.getByRole('list', { name: listName }) }
}

test('ChatHistoryPanel empty at 320px', async ({ page }) => {
    const { history, list } = await openNarrowHistory(page, 'empty')
    await expect(list).toContainText('Здесь появятся услышанные реплики.')
    await expect(history).toHaveScreenshot('chat-history-empty-320.png')
})

test('ChatWidget collapsed at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto(uiStoryUrl(`${widgetStory}--collapsed`))
    const widget = page.locator('#storybook-root > div > *')
    const preview = widget.locator('.chat-history__preview')
    const expand = widget.getByRole('button', { name: 'Развернуть историю чата' })
    await expect(widget.getByRole('list', { name: listName })).toBeHidden()
    await expect(widget.getByRole('navigation', { name: toolbarName })).toHaveCount(0)
    await expect(widget.locator('[data-fantasy-divider]')).toHaveCount(0)
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('Поручение принято')
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await readyUiStory(page)
    await expectUiFits(widget, 320)
    const [previewBox, expandBox] = await Promise.all([preview.boundingBox(), expand.boundingBox()])
    expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual(expandBox!.x)
    expect(previewBox!.y).toBeLessThan(expandBox!.y + expandBox!.height)
    expect(expandBox!.y).toBeLessThan(previewBox!.y + previewBox!.height)
    await expect(widget).toHaveScreenshot('chat-history-collapsed-320.png')

    const previewHeight = (await widget.boundingBox())!.height
    await page.goto(uiStoryUrl(`${widgetStory}--collapsed-typing`))
    await expect(widget.getByRole('textbox', { name: draftName })).toHaveValue('Я уже в пути.')
    await expect(widget.locator('.chat-composer-frame [data-fantasy-border]')).toHaveCount(0)
    await expect(preview).toBeHidden()
    await readyUiStory(page)
    await expectUiFits(widget, 320)
    expect((await widget.boundingBox())!.height).toBe(previewHeight)
    await expect(widget).toHaveScreenshot('chat-widget-collapsed-typing-320.png')
})

test('ChatHistoryPanel private at 320px', async ({ page }) => {
    const { history, list } = await openNarrowHistory(page, 'private')
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await expect(list).toContainText('Карту оставила у фонаря.')
    await expect(list).toContainText('Поручение принято')
    await expect(history).toHaveScreenshot('chat-history-private-320.png')
})

test('ChatHistoryPanel long-history at 320px', async ({ page }) => {
    const { history, list } = await openNarrowHistory(page, 'long-history')
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    await list.evaluate((element) => (element.scrollTop = element.scrollHeight))
    await expect(list.getByText(/После заката переправу не охраняют/)).toBeInViewport()
    await expect(history).toHaveScreenshot('chat-history-long-history-320.png')
})

test('ChatComposer preserves a draft at the character limit', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto(uiStoryUrl(`${composerStory}--at-limit`))
    const composer = page.locator('#storybook-root > div > *')
    const draft = composer.getByRole('textbox', { name: draftName })
    const initial = 'Я уже у ворот.'
    await expect(draft).toHaveValue(initial)
    await draft.press('End')
    await page.keyboard.insertText('!')
    await expect(draft).toHaveValue(initial)
    await expect(composer.getByText(/14\s*\/\s*14/)).toBeVisible()
    await readyUiStory(page)
    await expect(composer).toHaveScreenshot('chat-composer-at-limit-320.png')
})

test('ChatWidget reading state keeps the filter and omits the editor', async ({ page }) => {
    await page.goto(uiStoryUrl(`${widgetStory}--reading`))
    await expect(page.getByRole('textbox', { name: draftName })).toHaveCount(0)
    const toolbar = page.getByRole('navigation', { name: toolbarName })
    const nearby = toolbar.getByRole('button', { name: 'Рядом', exact: true })
    await nearby.click()
    await expect(nearby).toHaveAttribute('aria-pressed', 'true')
    const history = page.getByRole('complementary', { name: historyName })
    await expect(history.getByRole('listitem')).toHaveCount(1)
})

test('ChatWidget Default Controls show or hide the composed editor', async ({ page }) => {
    await page.goto(`/?path=/story/${widgetStory}--default`)
    const preview = page.frameLocator('#storybook-preview-iframe')
    const draft = preview.getByRole('textbox', { name: draftName })
    await expect(draft).toHaveValue('Я уже в пути.')
    await page.getByRole('tab', { name: /^Controls/ }).click()
    const draftControl = page.locator('#control-draft')
    await draftControl.fill('К пристани.')
    await draftControl.press('Tab')
    await expect(draft).toHaveValue('К пристани.')
    const typing = page.getByRole('switch', { name: 'typing' })
    await typing.press('Space')
    await expect(draft).toHaveCount(0)
    await expect(preview.getByRole('list', { name: listName })).toBeVisible()
    await typing.press('Space')
    await expect(draft).toHaveValue('К пристани.')
})
