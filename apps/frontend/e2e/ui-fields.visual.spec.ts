import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

const fields = [
    {
        name: 'UiInput',
        id: 'shared-common-uiinput',
        label: 'Сообщение',
        tag: 'INPUT',
        typed: 'Привет, Новогород!',
    },
    {
        name: 'UiTextarea',
        id: 'shared-common-uitextarea',
        label: 'Заметка',
        tag: 'TEXTAREA',
        typed: 'Привет, Новогород!\nВстречаемся у ворот.',
    },
] as const

for (const field of fields) {
    test(`${field.name} Default Controls update its native field and frame`, async ({ page }) => {
        await page.goto(`/?path=/story/${field.id}--default`)
        const preview = page.frameLocator('#storybook-preview-iframe')
        const direct = preview.locator('#storybook-root > div > *')
        const textbox = direct.getByRole('textbox', { name: field.label, exact: true })
        await expect(direct).toHaveCount(1)
        await expect(direct).toHaveCSS('border-top-width', '16px')
        await expect(textbox).toHaveJSProperty('tagName', field.tag)
        await expect(textbox).toBeEditable()

        await page.getByRole('tab', { name: /^Controls/ }).click()
        const valueControl = page.locator('#control-modelValue')
        await valueControl.fill('Новый текст из Controls')
        await valueControl.press('Tab')
        await expect(textbox).toHaveValue('Новый текст из Controls')

        await page.locator('#control-border').selectOption('border-004')
        await expect(direct).toHaveAttribute('data-fantasy-border', 'border-004')
        await expect(direct).toHaveCSS('border-top-width', '8px')
        await page.locator('label[for="control-invalid"]').click()
        await expect(textbox).toHaveAttribute('aria-invalid', 'true')
    })

    for (const width of [1280, 320]) {
        test(`${field.name} with typed text at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(uiStoryUrl(`${field.id}--default`))
            const fieldFrame = page.locator('#storybook-root > div > *')
            const textbox = page.getByRole('textbox', { name: field.label, exact: true })
            await expect(textbox).toBeEditable()
            await readyUiStory(page)
            await expectUiFits(fieldFrame, width)
            await textbox.focus()
            await textbox.fill('')
            await page.keyboard.insertText(field.typed)
            await expect(textbox).toBeFocused()
            await expect(textbox).toHaveValue(field.typed)
            await expect(fieldFrame).toHaveCSS('outline-style', 'solid')
            await expect(fieldFrame).toHaveScreenshot(
                `${field.name.toLowerCase()}-typing-${width}.png`
            )
        })

        test(`${field.name} empty, invalid, readonly and disabled states at ${width}px`, async ({
            page,
        }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(uiStoryUrl(`${field.id}--states`))
            const states = page.getByTestId('ui-field-states')
            const empty = states.getByRole('textbox', { name: 'Пустое', exact: true })
            const invalid = states.getByRole('textbox', { name: 'Ошибка', exact: true })
            const readonly = states.getByRole('textbox', { name: 'Только чтение', exact: true })
            const disabled = states.getByRole('textbox', { name: 'Недоступно', exact: true })
            await expect(empty).toBeEditable()
            await expect(empty).toHaveValue('')
            await expect(invalid).toHaveAttribute('aria-invalid', 'true')
            await expect(readonly).toHaveJSProperty('readOnly', true)
            await expect(readonly).toBeEnabled()
            await expect(disabled).toBeDisabled()
            await readyUiStory(page)
            await expectUiFits(states, width)
            await expect(states).toHaveScreenshot(`${field.name.toLowerCase()}-states-${width}.png`)
        })
    }
}

test('UiInput Default Controls change both slots independently', async ({ page }) => {
    await page.goto('/?path=/story/shared-common-uiinput--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    await expect(preview.getByRole('textbox', { name: 'Сообщение', exact: true })).toBeEditable()
    await page.getByRole('tab', { name: /^Controls/ }).click()
    const leading = page.getByRole('combobox', { name: 'leading', exact: true })
    const trailing = page.getByRole('combobox', { name: 'trailing', exact: true })
    await leading.selectOption({ label: 'Пустой span' })
    await trailing.selectOption({ label: 'Пустой span' })
    await expect(preview.getByTestId('ui-input-empty-leading')).toHaveCount(1)
    await expect(preview.getByTestId('ui-input-empty-trailing')).toHaveCount(1)
    await leading.selectOption({ label: 'Знак ввода' })
    await expect(preview.getByText('›', { exact: true })).toBeVisible()
    await expect(preview.getByTestId('ui-input-empty-leading')).toHaveCount(0)
    await expect(preview.getByTestId('ui-input-empty-trailing')).toHaveCount(1)
    await trailing.selectOption({ label: 'Счётчик' })
    await expect(preview.getByText('›', { exact: true })).toBeVisible()
    await expect(preview.getByText(/\d+ \/ 240/)).toBeVisible()
})

test('UiInput slots leave enough room to edit text at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto(uiStoryUrl('shared-common-uiinput--with-slots'))
    const frame = page.locator('#storybook-root > div > *')
    const textbox = frame.getByRole('textbox', { name: 'Сообщение', exact: true })
    await expect(frame.getByText('›', { exact: true })).toBeVisible()
    await textbox.fill('Привет!')
    await expect(textbox).toBeFocused()
    await expect(frame.getByText('7 / 240', { exact: true })).toBeVisible()
    await readyUiStory(page)
    await expectUiFits(frame, 320)
    await expect(frame).toHaveScreenshot('uiinput-with-slots-320.png')
})
