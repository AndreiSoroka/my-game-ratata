# TODO

- [ ] Учесть потребителей `entities/chats`, `entities/menus`, `entities/player-effects`, `entities/player-vitals` и `entities/quick-actions` из `src/game` в проверке Steiger. Для `entities/chats` также учесть `widgets/chats`. Когда линтер будет видеть эти зависимости, убрать исключения `fsd/insignificant-slice` для этих слайсов.
- [ ] Убрать исключение `fsd/insignificant-slice` для `entities/exchanges`, когда Steiger будет учитывать `widgets/exchanges` и игровой адаптер.
- [ ] После переноса игровых адаптеров в распознаваемый слой FSD убрать исключение `fsd/typo-in-layer-name` для `src/game`.
