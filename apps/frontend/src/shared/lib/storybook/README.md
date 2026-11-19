# Storybook rendering

`renderVueStory` mounts a production Vue component inside the Web Components Storybook renderer and unmounts it when its host is removed. Import it through this directory's `index.ts`. This library contains rendering lifecycle code, not game fixtures or UI skins.

The optional third argument configures presentation without changing the component:

```ts
renderVueStory(Component, props, { background: 'transparent', padding: '24px' })
```

The default host is transparent, with 24px padding, so Storybook's native background selector owns one canvas background. The compatibility renderer under `game/stories` supplies the original green host for existing game examples. Component fixtures may still supply intentional surfaces (for example, a white alpha-color probe or a nested parchment panel); these are component content rather than a second presentation stage.
