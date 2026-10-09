# pixel-pet

A tiny animated pixel-art companion that lives above your Claude Code prompt and reacts to your session.

![four forms × six moods](docs/pixel-pet.png)

```
 ▄▀▀▀▀▄   Bit is typing furiously…
 █▀▄▄▀█   lv 3 spark  ♥ pet
 ▀▄▄▄▄▀
```

- **Bobs** while Claude works, **bounces with sparkles** when a turn finishes, **sweats** when a command fails, **dozes** after 5 idle minutes. Press **♥ pet** (or `ctrl+x tab`, then `p`) and it blushes.
- Smooth: it animates at 10 fps on the surface's own clock, with blinks and eased bobbing, and moods **crossfade** instead of popping.
- Four rows tall, drawn with half-block characters, so empty pixels show your terminal or the desktop app behind it. There's no box around it.
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

Settings (`/config`): `name`, `sound`.

Part of [lakmadev/claude-mods](https://github.com/lakmadev/claude-mods), a pack of eleven Claude Code mods.

MIT licensed.
