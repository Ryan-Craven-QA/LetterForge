# LetterForge

LetterForge is a modern Wordle-style web app built with vanilla HTML, CSS, and JavaScript.

It includes:

- Single-player play with animated tile reveals
- Multiple difficulty levels (3 to 7 letters + random 3-15)
- Online dictionary validation for guesses
- Dynamic dark themes
- Realtime 1v1 challenge mode with synchronized starts and rematches
- Stats tracking and share-to-clipboard emoji results

## Tech Stack

- HTML
- CSS
- JavaScript (no framework)
- PeerJS (for browser-to-browser realtime 1v1)

## Getting Started

No build tools are required.

1. Clone the repository:

```bash
git clone https://github.com/Ryan-Craven-QA/LetterForge.git
cd LetterForge
```

2. Open `index.html` in your browser.

That is it. The app runs as a single-page client app.

## How To Play

1. Type letters to fill the current row.
2. Use Backspace to remove letters.
3. Press Enter to submit.
4. Tile colors:
   - Green: correct letter and position
   - Yellow: correct letter, wrong position
   - Gray: not in the word
5. Solve within 6 guesses.

## Difficulty Levels

- Very Easy: 3 letters
- Easy: 4 letters
- Normal: 5 letters
- Hard: 6 letters
- Very Hard: 7 letters
- Random: random length from 3 to 15

## 1v1 Realtime Challenge

1. Start a game, then click `1v1`.
2. Share the copied challenge link with a friend.
3. Both players join and click `Ready`.
4. When both are ready, the round starts with a synchronized countdown.
5. The round ends for both players when one player solves first.
6. Both can click `Rematch`, then `Ready` again for another round.

## Stats

- Solo stats are tracked locally in your browser.
- 1v1 stats are session-based and reset for each new 1v1 session.

## Themes

Use the `Theme` selector in the header to switch visual styles:

- Classic
- Midnight
- Forest
- Sunset

## Notes

- Word validity is checked against an online dictionary API.
- Realtime mode depends on browser peer connectivity and active sessions.
