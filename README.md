# pixel-pet

An animated pixel-art companion that lives above your Claude Code prompt and reacts to your session.

![five evolution forms × six moods](docs/pixel-pet.png)

- **Bounces** while Claude works, **celebrates** finished turns with sparkles, **sweats** when a command fails, **naps** after 5 idle minutes.
- Press **Pet ♥** (or `ctrl+x tab`, then `p`) and it blushes.
- Earns XP every turn and **evolves**: teal sprout → purple spark (level 3) → antenna (5) → coral blaze (6) → golden crowned legend (10). Level-ups play a short jingle.
- Notices when context is nearly full: "is stuffed with tokens (85% context)".
- Pixel art in the terminal (half-block raster, animated at ~2 fps); an animated SVG in the desktop app.

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

Part of [lakmadev/claude-mods](https://github.com/lakmadev/claude-mods), a pack of ten Claude Code mods.

MIT licensed.
