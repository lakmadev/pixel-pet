# pixel-pet

A tiny animated pixel-art companion that lives above your Claude Code prompt and reacts to your session.

![four forms × six moods](docs/pixel-pet.png)

```
 ▄▀▀▀▀▄   Bit is typing furiously…
 █▀▄▄▀█   lv 3 spark  ♥ pet
 ▀▄▄▄▄▀
```

- **Bobs** while Claude works, **bounces with sparkles** when a turn finishes, **sweats** when a command fails, **dozes** after 5 idle minutes. Press **♥ pet** (or `ctrl+x tab`, then `p`) and it blushes.
- **Watches you type.** Its eyes follow your caret across the line as if reading along ("is reading your code…" when it looks like code). A backspace makes it wince; deleting a big chunk makes it gasp with a "!". A huge paste gets a "whoa", and saying please or thanks makes it blush. It settles back about 2 seconds after you stop.
- Smooth: blinks, eased bobbing, and moods that **fade** into each other instead of popping.
- Small and frameless. In the terminal it's four rows of half-block characters animated at 10 fps; in the desktop app it's a crisp transparent SVG whose motion is built in, gliding between pixels.
- Levels up every turn and changes colour as it grows: teal sprout → purple spark (lv 3) → coral blaze (lv 6) → golden legend with a crown (lv 10). Level-ups play a short jingle.

## Install

```
/plugin install pixel-pet --marketplace lakmadev/pixel-pet
```

## Commands

| Command | |
| --- | --- |
| `/pet` | Stats: level, XP, turns together, age |
| `/pet rename <name>` | Rename it (default: Bit) |
| `/pet hide` / `/pet show` | Tuck it away or bring it back |
| `/pet color <name>` | Pick a colour: teal, purple, coral, gold, pink, mint, sky, lava, ghost, midnight; or `auto` to follow its level. It tries each one on as you type the name, and the names show up as suggestions. |

Settings (`/config`): `name`, `color`, `sound`.

Part of [lakmadev/claude-mods](https://github.com/lakmadev/claude-mods), a pack of eleven Claude Code mods.

MIT licensed.
