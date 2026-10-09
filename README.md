# pixel-pet

A tiny animated pixel pet above your Claude Code prompt that reacts to your session and your typing, with a live context meter beside it.

![the band in the terminal and the desktop app](docs/pixel-pet-band.png)

![nine moods, 28 colours](docs/pixel-pet.png)

- **Lives above your prompt**, four rows tall, with no box around it. It bobs while Claude works, bounces with sparkles when a turn finishes, sweats when a command fails, and dozes when you're away.
- **Narrates what Claude is doing**: "is reading auth.ts…", "is running the tests 🧪", "is committing the work ✍️", "is installing packages 📦", "is searching the web for …", "sent Explore off on a side quest 🧭", "is waiting for your OK ✋", "is tidying its memory 🧹" and more. Each line stays up for at least a second. On desktop the new line slides up into place as the old one drifts away; in the terminal, where text moves only by whole rows, it fades through.
- **Click it to pet it.** It blushes and shows hearts.
- **Watches you type.** Its eyes follow your caret across the line as if reading along ("is reading your code…" when it looks like code). A backspace makes it wince; deleting a big chunk makes it gasp with a "!". A huge paste gets a "whoa", and saying please or thanks makes it blush.
- **Context meter** on its second line: a gradient bar (mint → amber → red) for how full the context window is. It glides to each new reading, and a highlight sweeps along it while Claude works.
- **Usage limits, plainly.** On a Claude plan you see your 5-hour and weekly windows as small pills with percentages; a window's reset time appears once it's past 70%. On the API or Bedrock/Vertex/Foundry you see the dollars actually billed. Point at the meter (ⓘ) for the full card: context tokens, when each window resets, and how you're billed.
- **28 colours.** `/pet color pink` changes it. As you type the name it tries each colour on, and the names show up as suggestions.
- Smooth everywhere. In the terminal, the pet and the meter animate on the terminal's own frame clock. In the desktop app they're transparent SVGs with the motion built in. Moods and colours fade into each other instead of popping.

## Install

```
/plugin install pixel-pet --marketplace lakmadev/pixel-pet
```

## Commands

| Command | |
| --- | --- |
| `/pet` | Its name, colour, turns together, pets, and age |
| `/pet color <name>` | teal, red, orange, yellow, green, blue, purple, pink, white, gray, black, brown, cyan, mint, lime, sky, navy, indigo, violet, lavender, magenta, rose, peach, coral, gold, lava, ghost, midnight |
| `/pet rename <name>` | Rename it (default: Bit) |
| `/pet hide` / `/pet show` | Tuck it away or bring it back |

Settings (`/config`): `name`, `color`.

Part of [lakmadev/claude-mods](https://github.com/lakmadev/claude-mods), a pack of eleven Claude Code mods.

MIT licensed.
