import type {
    ClientMessage,
    GameLocale,
    ServerMessage,
    SpeechTranslationServerMessage,
} from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

const russian = 'Где находится городской рынок?'
const english = 'Where is the city gate?'

test('chooses a locale and translates the same public chat receipt for each listener', async ({
    browser,
    baseURL,
}) => {
    test.setTimeout(65_000)
    const contexts = await Promise.all([
        browser.newContext({ baseURL, viewport: { width: 390, height: 844 } }),
        browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } }),
    ])
    const [ru, en] = (await Promise.all(contexts.map((context) => context.newPage()))) as [
        Page,
        Page,
    ]
    try {
        const russianClient = await speechFixture(ru, 'ru', english, 'Где городские ворота?')
        const englishClient = await speechFixture(en, 'en', russian, 'Where is the city market?')
        await ru.goto('/?test=1')
        await en.goto('/?test=1')
        await expect(ru.locator('html')).toHaveAttribute('lang', 'ru')
        await en.getByLabel('Язык интерфейса').selectOption('en')
        await expect(en.locator('html')).toHaveAttribute('lang', 'en')
        await expect(en).toHaveTitle(/Lands of Novogorod/)
        await join(ru, 'Locale Redwood')
        await join(en, 'Locale Fir')
        expect(russianClient.commands).toContainEqual(
            expect.objectContaining({ type: 'join', locale: 'ru' })
        )
        expect(englishClient.commands).toContainEqual(
            expect.objectContaining({ type: 'join', locale: 'en' })
        )
        const point = await ru.evaluate(() => window.__ratataTest!.getState().player!.position)
        const route = await en.evaluate(
            (position) =>
                window.__ratataTest!.navigate(position, { timeoutMs: 20_000, tolerance: 22 }),
            point
        )
        expect(route.status).toBe('arrived')

        await ru.getByRole('button', { name: 'Развернуть историю чата' }).click()
        await en.getByRole('button', { name: 'Expand chat history' }).click()
        await sendChat(ru, russian)
        await checkTranslation(en, englishClient, 'Messages heard', 'Original')
        await sendChat(en, english)
        await checkTranslation(ru, russianClient, 'Услышанные реплики', 'Оригинал')
        await checkLiveWhisper(ru, en, englishClient.real)

        await en.locator('canvas[data-game-canvas]').focus()
        await en.keyboard.press('Escape')
        const menu = en.getByRole('dialog', { name: 'Game menu' })
        await menu.getByRole('button', { name: 'Interface language: Русский' }).click()
        await expect(en.locator('html')).toHaveAttribute('lang', 'ru')
        await expect
            .poll(() => englishClient.commands)
            .toContainEqual({ type: 'set_locale', locale: 'ru' })
        expect(await en.evaluate(() => window.__ratataTest!.getState().connected)).toBe(true)
        await en.reload()
        await expect(en.locator('html')).toHaveAttribute('lang', 'ru')
        await expect(en.getByLabel('Язык интерфейса')).toHaveValue('ru')
    } finally {
        await Promise.all(contexts.map((context) => context.close()))
    }
})

async function join(page: Page, name: string): Promise<void> {
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate((nickname) => window.__ratataTest!.join(nickname, 'vanguard'), name)
    await expect(page.locator('canvas[data-game-canvas]')).toBeVisible()
    await page.addStyleTag({ content: '.test-panel { display: none !important }' })
}

async function sendChat(page: Page, text: string): Promise<void> {
    await page.evaluate(
        (message) => window.__ratataTest!.send({ type: 'chat', text: message }),
        text
    )
}

async function checkLiveWhisper(sender: Page, listener: Page, real: boolean): Promise<void> {
    if (!real) return
    const recipient = await listener.evaluate(() => window.__ratataTest!.getState().localPlayerId!)
    await sender.evaluate(
        ({ targetId, text }) => window.__ratataTest!.send({ type: 'whisper', targetId, text }),
        { targetId: recipient, text: russian }
    )
    await expect
        .poll(() =>
            listener.evaluate(
                () =>
                    window.__ratataTest!.getState().snapshot?.social?.whisper?.messages.at(-1)
                        ?.translation?.locale
            )
        )
        .toBe('en')
    const whisper = listener.getByRole('listitem').filter({ hasText: /^Whisper · Locale Redwood/ })
    await expect(whisper.locator('span[lang="en"]')).toBeVisible()
}

async function speechFixture(
    page: Page,
    locale: GameLocale,
    original: string,
    translation: string
) {
    const commands: ClientMessage[] = []
    const real = process.env['E2E_REAL_TRANSLATION'] === '1'
    let deliver: (() => void) | undefined
    await page.routeWebSocket(/\/ws$/, (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((raw) => {
            if (typeof raw === 'string') commands.push(JSON.parse(raw) as ClientMessage)
            server.send(raw)
        })
        server.onMessage((raw) => {
            const message = typeof raw === 'string' ? (JSON.parse(raw) as ServerMessage) : undefined
            if (message?.type === 'speech_translation' && !real) return
            socket.send(raw)
            if (real || message?.type !== 'event') return
            const { event } = message
            if (
                event.kind !== 'chat' ||
                event.text !== original ||
                !event.language ||
                !event.actorId ||
                event.speechId === undefined
            )
                return
            const update: SpeechTranslationServerMessage = {
                type: 'speech_translation',
                actorId: event.actorId,
                speechId: event.speechId,
                locale,
                text: translation,
            }
            deliver = () => socket.send(JSON.stringify(update))
        })
    })
    return { commands, locale, original, real, translation, deliver: () => deliver?.() }
}

async function checkTranslation(
    page: Page,
    fixture: Awaited<ReturnType<typeof speechFixture>>,
    historyLabel: string,
    originalLabel: string
): Promise<void> {
    const history = page.getByRole('list', { name: historyLabel })
    if (!fixture.real) {
        await expect(history.getByText(fixture.original, { exact: true })).toBeVisible()
        fixture.deliver()
    }
    const row = history
        .getByRole('listitem')
        .filter({ has: page.getByText(originalLabel, { exact: true }) })
    await expect(row).toHaveCount(1)
    const main = row.locator(`> span[lang="${fixture.locale}"]`)
    await expect(main).toBeVisible()
    if (!fixture.real) await expect(main).toHaveText(fixture.translation)
    await row.getByText(originalLabel, { exact: true }).click()
    await expect(row.getByText(fixture.original, { exact: true })).toBeVisible()
}
