# Fantasy UI Borders

Reusable presentation components for the original [Kenney Fantasy UI Borders](https://kenney.nl/assets/fantasy-ui-borders) pack. Components depend only on Vue and this module's assets; consumers pass colors directly or obtain them from the separate Shared theme.

| Public API                                        | Component        | Artwork                                                                           |
| ------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `@/shared/ui/external/fantasy-ui-borders/border`  | `FantasyBorder`  | All 32 transparent-center outlines                                                |
| `@/shared/ui/external/fantasy-ui-borders/divider` | `FantasyDivider` | All six horizontal dividers, regular and fading, with left, right or both ends    |
| `@/shared/ui/external/fantasy-ui-borders/panel`   | `FantasyPanel`   | All 32 filled panels, including translucent-border and translucent-center artwork |

Each component folder owns its styles, types, documentation, focused Storybook stories and unit tests. Import through that folder's `index.ts`; raw asset metadata is private. Panel and Border have different native slices: the filled panel artwork includes additional inner-edge detail.

The complete source pack, license and archive origin are preserved in `assets`. The old public asset directory keeps only outline `026` and its license/source record for legacy game buttons. Existing game controls use their current implementation until explicitly migrated.
