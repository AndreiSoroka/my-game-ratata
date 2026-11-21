# TODO

- [ ] Учесть потребителей `entities/chats`, `entities/menus`, `entities/player-effects`, `entities/player-vitals` и `entities/quick-actions` из `src/game` в проверке Steiger. Для `entities/chats` также учесть `widgets/chats`. Когда линтер будет видеть эти зависимости, убрать исключения `fsd/insignificant-slice` для этих слайсов.
- [ ] После переноса игровых адаптеров в распознаваемый слой FSD убрать исключение `fsd/typo-in-layer-name` для `src/game`.
