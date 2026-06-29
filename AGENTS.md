# Repository Instructions

## Playwright

- Run Playwright tests and automation in headless mode by default.
- Use a visible browser only when the user explicitly asks to open, show, or visually inspect the UI in the in-app browser.

## Storybook

- Storybook stories should showcase clean, focused components and states, not a one-off pile of unrelated UI inside every story.
- Extract reusable HTML/CSS/Vue primitives or render helpers first, then compose larger examples such as HUD groups, windows, inventory panels, or quest dialogs from those primitives.

## Skills

- Character sprite creation rules live in `skills/персонажи/README.md`.
- Character gameplay architecture rules also live in `skills/персонажи/README.md`: every player, scripted NPC, AI NPC, or hybrid is the same `GameCharacter`; only controllers differ.

## Old Game Reference

- The old game lives at `/Users/andreisoroka/git/pet-projects/git/pet-projects/my-ai-world-dragonat`; use it as a reference for map, AI, combat, and chat behavior when rebuilding this prototype.
