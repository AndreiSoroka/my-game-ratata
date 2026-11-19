# Menu input adapters

`menuKeyboardInput(event, dispatch)` translates physical W/S, arrow keys, Tab/Shift+Tab,
Home/End and Enter/Space/F into device-independent menu commands. Bind it to the
owning menu's keydown event; it installs no global listeners and does not intercept
text editing, composition or browser modifier shortcuts. Held confirmation is
consumed without repeated activation.

The target owns item order, disabled skipping, focus and activation. Gamepad or
joystick adapters can dispatch the same `MenuInputCommand` values without creating
keyboard events or duplicating navigation rules. Closing a window stays with its owner.
Gamepad adapters own dead zones and repeat timing; dispatch `activate` on a new press
rather than on every polling frame.
