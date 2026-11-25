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
    await leading.selectOption({ label: 'Цветной блок' })
    await trailing.selectOption({ label: 'Цветной блок' })
    await expect(preview.getByTestId('ui-input-empty-leading')).toHaveCount(1)
    await expect(preview.getByTestId('ui-input-empty-trailing')).toHaveCount(1)
    await leading.selectOption({ label: 'Текст' })
    await expect(preview.getByText('›', { exact: true })).toBeVisible()
    await expect(preview.getByTestId('ui-input-empty-leading')).toHaveCount(0)
    await expect(preview.getByTestId('ui-input-empty-trailing')).toHaveCount(1)
    await trailing.selectOption({ label: 'Счётчик' })
    await expect(preview.getByText('›', { exact: true })).toBeVisible()
    await expect(preview.getByText(/\d+ \/ 240/)).toBeVisible()
})

test('UiSelect Controls drive the native options slot and validity', async ({ page }) => {
    await page.goto('/?path=/story/shared-common-uiselect--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const select = preview.getByRole('combobox', { name: 'Место' })
    await expect(select).toHaveJSProperty('tagName', 'SELECT')
    await select.selectOption('forest')
    await expect(select).toHaveValue('forest')
    await page.getByRole('tab', { name: /^Controls/ }).click()
    const options = page.locator('#control-optionsSlot')
    await options.selectOption({ label: 'Пустой цветной пункт' })
    await expect(select.locator('option')).toHaveCount(1)
    await expect(select.locator('option')).toBeEmpty()
    await options.selectOption({ label: 'Текст' })
    await expect(select.locator('option')).toHaveText('Новогород')
    await options.selectOption({ label: 'Группа мест' })
    await expect(select.locator('optgroup')).toHaveAttribute('label', 'Соседние места')
    await page.locator('label[for="control-invalid"]').click()
    await expect(select).toHaveAttribute('aria-invalid', 'true')
    await page.locator('label[for="control-disabled"]').click()
    await expect(select).toBeDisabled()
})

for (const width of [1280, 320]) {
    for (const variant of ['default', 'invalid', 'disabled']) {
        test(`UiSelect ${variant} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(uiStoryUrl(`shared-common-uiselect--${variant}`))
            const frame = page.locator('.ui-select')
            const select = page.getByRole('combobox', { name: 'Место' })
            await expect(select).toBeVisible()
            await readyUiStory(page)
            await expectUiFits(frame, width)
            await expect(frame).toHaveScreenshot(`uiselect-${variant}-${width}.png`)
        })
    }
}

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
