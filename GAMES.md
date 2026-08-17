# GAMES.md — Complete Game Reference

Quick-reference for every game in the repo. An AI agent should read this file
before touching any game-specific code.

**Read first:** `AGENTS.md` (working agreement + traps), then `CLAUDE.md` (architecture),
`ADDING_A_GAME.md` (board), `ADDING_AN_ARCADE_GAME.md` (arcade)

**Sections:** Layer A (12 board games) · Layer A′ (Mahjong, BANG!) · Layer B (9 arcade
games) · Layer C (3 sandboxes) · Cross-layer reference

---

## Layer A — Board Games (12 games)

All board games share this room structure (`server/state.js`):

```
room.id          — string (UUID)
room.gameType    — string (game key, e.g. 'chess')
room.status      — 'waiting' | 'active' | 'finished'
room.hostColor   — 'white' | 'black'
room.guestColor  — 'black' | 'white'
room.timers      — { white, black, activeColor, lastTickAt, minutes }
room.moves       — array of move records
+ game-specific fields added by handler.initRoom()
```

**Handler interface** (`server/handlers/<game>.js`):
```javascript
initRoom(base, opts)                    // mutates base, adds game fields
resetRoom(room)                         // resets for rematch
handleMove(socket, room, role, data)    // validates + applies move + emits events
```

**Emits on move:** `game:move:made` with `{ move, board, timers, turn, ... }`  
**Game over:** call `endGame(room, winnerColor, reason, extras)` from `server/endgame.js`

---

### chess

Handler: `server/handlers/chess.js` | Frontend: `public/js/game-chess.js`

**State fields:**
```
room.chess   — chess.js instance (v0.12.0 — DO NOT upgrade, API changed in v0.13)
room.fen     — FEN string (current position)
room.pgn     — PGN record
```

**Move format (`data`):**
```javascript
{ from: 'e2', to: 'e4', promotion: 'q' }  // promotion optional, only for pawn promotion
```

**Win conditions:**
- `chess.in_checkmate()` → `endGame(room, yourColor, 'checkmate')`
- `chess.in_stalemate()` → `endGame(room, 'draw', 'stalemate')`
- `chess.in_threefold_repetition()` → `endGame(room, 'draw', 'repetition')`
- `chess.insufficient_material()` → `endGame(room, 'draw', 'insufficient')`

**Move record:** `{ san, from, to, fen, captured, timestamp }`

**AI:** `public/js/ai-chess.js` — minimax depth-3, alpha-beta pruning

---

### omok

Handler: `server/handlers/omok.js` | Frontend: `public/js/game-omok.js`

**State fields:**
```
room.boardSize   — { size: 15 } (default; options 13, 15, 19)
room.board       — size×size 2D array of null|'white'|'black'
room.currentTurn — 'black' (black moves first)
room.lastMove    — { row, col }
```

**Move format (`data`):**
```javascript
{ row: 7, col: 7 }
```

**Win conditions:**
- Exactly 5 in a row (Renju rule — 6+ is NOT a win): `endGame(room, yourColor, 'five-in-a-row', { winCells })`
- Board full (225 moves): `endGame(room, 'draw', 'board-full')`

**Move record:** `{ row, col, color, moveNum }`

**AI:** `public/js/ai-omok.js` — heuristic pattern scoring

---

### connect4

Handler: `server/handlers/connect4.js` | Frontend: `public/js/game-connect4.js`

**State fields:**
```
room.boardSize   — { rows: 6, cols: 7 } (options 5×5 to 8×9)
room.board       — rows×cols 2D array of null|'white'|'black'
room.currentTurn — 'white' (host/white = red, guest/black = yellow)
room.colHeights  — array[cols] tracking filled rows per column
room.lastMove    — { row, col }
```

**Move format (`data`):**
```javascript
{ col: 3 }  // piece falls by gravity to lowest row
```

**Win conditions:**
- 4 in a row (any direction): `endGame(room, yourColor, 'four-in-a-row', { winCells })`
- Board full: `endGame(room, 'draw', 'board-full')`

**Move record:** `{ col, row, color, moveNum }`

**AI:** `public/js/ai-connect4.js` — minimax depth-6, alpha-beta

---

### othello

Handler: `server/handlers/othello.js` | Frontend: `public/js/game-othello.js`

**State fields:**
```
room.board              — 8×8 2D array of null|'white'|'black' (standard Othello setup)
room.currentTurn        — 'black' (black moves first)
room.lastMove           — { row, col }
room.consecutivePasses  — 0|1|2 (two passes = game over)
```

**Move format (`data`):**
```javascript
{ row: 3, col: 2 }
```

**Win conditions:**
- Both players pass (no valid moves on either side): `endGame(room, winner, 'board-full', { scores: { white, black } })`
- Winner = more stones; equal = `'draw'`

**Move record:** `{ row, col, color, flipped: [{row,col}], moveNum, boardRows }`

**Note:** If the current player has no valid moves, they must pass — `consecutivePasses++`. If the game-end check triggers only after TWO consecutive passes.

**AI:** `public/js/ai-othello.js` — minimax depth-4, corner weighting

---

### checkers

Handler: `server/handlers/checkers.js` | Frontend: `public/js/game-checkers.js`

**State fields:**
```
room.board       — 8×8 2D array of null|{ color:'white'|'black', king:boolean }
room.currentTurn — host color
room.mustJump    — null | { row, col }  (set during forced multi-jump chain)
room.lastMove    — { row, col }  (endpoint of last move)
```

**Move format (`data`):**
```javascript
{ from: { row: 5, col: 0 }, to: { row: 4, col: 1 } }
```

**Win conditions:**
- Opponent has no pieces: `endGame(room, yourColor, 'no-pieces')`
- Opponent has no valid moves: `endGame(room, yourColor, 'no-pieces')`

**Move record:** `{ from, to, captured: {row,col}|null, promoted: boolean, color, moveNum }`

**Notes:**
- Forced jumps: if any jump is available, only jumps are legal
- `mustJump`: after a capture, if more captures exist from the landing square, same piece must continue — turn does NOT pass
- King promotion: piece reaching opposite back row becomes king; kings move diagonally in both directions

**AI:** `public/js/ai-checkers.js` — minimax depth-4

---

### indianpoker

Handler: `server/handlers/indianpoker.js` | Frontend: `public/js/game-indianpoker.js`

**State fields:**
```
room.phase        — 'waiting' | 'bet' | 'showdown'
room.numDecks     — 1-5 (default 2)
room.winCondition — 1 (infinite) | 2 (until deck exhausted)
room.deck         — array of { rank: 1-10, suit }
room.deckUsed     — number of dealt cards
room.hands        — { host: card|null, guest: card|null }
room.chips        — { host: 100, guest: 100 }
room.pot          — number
room.bets         — { host: 0, guest: 0 }
room.ante         — 5
room.roundNum     — number
room.betTurn      — 'host' | 'guest'
room.raiseCount   — 0-3 (max 3 raises per round)
```

**Move format (via `indianpoker:action` event, not `game:move`):**
```javascript
{ action: 'fold' | 'call' | 'raise' }
```

**Win conditions:**
- Chips depleted: `endGame(room, loser_chips<=0 ? opponent : player, 'chips-depleted')`
- Deck exhausted (winCondition===2): more chips wins

**Showdown rule:** Ace(1) beats 10 only; otherwise higher rank wins.  
**Fold penalty:** Folding with rank 10 costs extra ante.  
**Raise amount:** Always fixed at 5 (not client-specified). Max 3 raises per round.

**AI:** `public/js/ai-indianpoker.js` — card comparison heuristic

---

### applegame

Handler: `server/handlers/applegame.js` | Frontend: `public/js/game-applegame.js`

**State fields:**
```
room.board       — 10×17 2D array of 1-9|null (null = claimed cell)
room.currentTurn — 'white'
room.scores      — { white: 0, black: 0 }
room.lastMove    — { row1, col1, row2, col2 }
```

**Move format (`data`):**
```javascript
{ row1: 0, col1: 0, row2: 2, col2: 3 }  // bounding rectangle corners
```

**Win conditions:**
- No valid move exists on the board: `endGame(room, winner, 'no-moves', { scores })`
- Winner = more cells claimed; equal = `null` (draw)

**Score:** `room.scores[color] += cells.length` (count of cells in rectangle)

**Validation:** All non-null cells inside the rectangle must sum to exactly 10.

**Move record:** `{ row1, col1, row2, col2, cells: [{row,col}], count, color, notation }`

**AI:** `public/js/ai-applegame.js` — greedy largest rectangle search

---

### battleship

Handler: `server/handlers/battleship.js` | Frontend: `public/js/game-battleship.js`

**State fields:**
```
room.phase       — 'placement' | 'active'
room.currentTurn — 'white'
room.shipGrids   — { white: 10×10|null, black: 10×10|null }  (ship name at each cell)
room.attackGrids — { white: 10×10, black: 10×10 }  (null|'hit'|'miss')
room.shipStatus  — { white: { shipName: remaining }, black: { shipName: remaining } }
```

**Ships:** carrier(5), battleship(4), cruiser(3), submarine(3), destroyer(2)

**Move format (`data`):**
- Placement: `{ action: 'place', ships: [{ name, cells: [{r,c}] }] }`
- Attack: `{ row: 3, col: 5 }`

**Win conditions:**
- All opponent ships sunk: `endGame(room, yourColor, 'all-ships-sunk')`

**Move record (active phase):** `{ color, row, col, result:'hit'|'miss'|'sunk', sunkShip, notation, moveNum }`

**Notes:**
- Placement validated server-side: straight line, no overlap, within 10×10, correct count
- Both players must place before `phase` changes to `'active'`
- When phase = `'active'`, attacker's grid = opponent's `shipGrid` (not revealed)

**AI:** `public/js/ai-battleship.js` — hunt-and-target strategy

---

### backgammon

Handler: `server/handlers/backgammon.js` | Frontend: `public/js/game-backgammon.js`

**State fields:**
```
room.board       — {
  points: [null, {color,count}×24, null]  // 25-element, 1-indexed (index 0 unused)
  bar:     { white: 0, black: 0 }
  borneOff:{ white: 0, black: 0 }
}
room.currentTurn  — 'white'
room.phase        — 'rolling' | 'moving'
room.dice         — [d1, d2]
room.remainingMoves — array of die values still to use this turn
```

**Move format (`data`):**
- Roll: `{ type: 'roll' }`
- Move: `{ type: 'move', from: 1-24|'bar', to: 1-24|'off', dieUsed: 1-6 }`

**Win conditions:**
- 15 pieces borne off: `endGame(room, yourColor, 'all-borne-off')`

**Movement rules:**
- White moves point 1→24; Black moves point 24→1
- Must enter from bar before any other move
- Doubles grant 4 moves instead of 2
- Bearing off only when all pieces in home board (1-6 for white, 19-24 for black)
- Landing on blot (single opponent piece) sends it to bar

**Move record:** `{ type, from, to, dieUsed, color, hitPiece: boolean }`

**AI:** `public/js/ai-backgammon.js` — heuristic evaluation

---

### texasholdem

Handler: `server/handlers/texasholdem.js` | Frontend: `public/js/game-texasholdem.js`

**State fields:**
```
room.phase     — 'waiting'|'preflop'|'flop'|'turn'|'river'|'showdown'
room.deck      — shuffled card array { rank:'2'-'A', suit:'♠'|'♥'|'♦'|'♣' }
room.hands     — { host: [card,card], guest: [card,card] }
room.community — [] → [c,c,c] → [c,c,c,c] → [c,c,c,c,c]
room.pot       — number
room.chips     — { host: 1000, guest: 1000 }
room.bets      — { host: currentBet, guest: currentBet }
room.roundBet  — highest bet this street
room.button    — 'host'|'guest' (dealer = small blind in heads-up)
room.betTurn   — 'host'|'guest'|null
room.raiseCount — 0-4 (max 4 raises per street)
room.roundNum  — number
room.acted     — { host: boolean, guest: boolean }
```

**Move format (`data`):**
```javascript
{ action: 'fold' | 'check' | 'call' | 'raise' }
```

**Win conditions:**
- Opponent folds → winner takes pot
- Chips depleted: `endGame(room, winner, 'chips-depleted')`
- Showdown (after river): evaluateBestHand() picks best 5 of 7; tie = split pot

**Blind structure:** SB=10, BB=20; heads-up dealer is SB  
**Raise increment:** Fixed at BB (20)  
**Hand rankings (10 levels):** high card → pair → two pair → three of a kind → straight → flush → full house → four of a kind → straight flush → royal flush

**Move record:** includes hand names, community cards, winner, reason, chips, roundNum

**AI:** `public/js/ai-texasholdem.js` — hand-strength heuristic

---

### dotsboxes

Handler: `server/handlers/dotsboxes.js` | Frontend: `public/js/game-dotsboxes.js`

**State fields:**
```
room.size        — 3-7 (N×N boxes; default 5)
room.edges       — {
  hLines: (size+1)×size,  // horizontal edges; 0=undrawn, 1=white, 2=black
  vLines: size×(size+1)   // vertical edges
}
room.boxes       — size×size  (0=none, 1=white, 2=black)
room.scores      — { white: 0, black: 0 }
room.currentTurn — host color
```

**Move format (`data`):**
```javascript
{ edge: { type: 'h'|'v', row: 2, col: 3 } }
```

**Edge coordinates:**
- `h`: horizontal line, 0 ≤ row ≤ size, 0 ≤ col < size
- `v`: vertical line, 0 ≤ row < size, 0 ≤ col ≤ size

**Win conditions:**
- All lines drawn: `endGame(room, winner, 'all-lines-drawn')`
- Winner = more boxes; equal = `null`

**Turn mechanic:** Completing one or more boxes keeps the current player's turn.

**Move record:** `{ edge, color, boxesCompleted, scores, moveNum }`

**AI:** `public/js/ai-dotsboxes.js` — chain avoidance strategy

---

### mancala

Handler: `server/handlers/mancala.js` | Frontend: `public/js/game-mancala.js`

**State fields:**
```
room.pits        — 14-element array (0-indexed):
  [0-5]  white pits (4 seeds each at start)
  [6]    white store (mancala)
  [7-12] black pits (4 seeds each at start)
  [13]   black store
room.currentTurn — host color
```

**Constants:**
```
WHITE_STORE = 6, BLACK_STORE = 13
White pits: 0-5, Black pits: 7-12
Opposite pit: oppIdx = 12 - idx
```

**Move format (`data`):**
```javascript
{ pit: 2 }  // pit index (0-13); must be own pit with seeds > 0
```

**Win conditions:**
- One side's pits all empty → remaining seeds go to their store → `endGame(room, winner, 'empty-side')`
- Winner = more seeds in store; equal = `null`

**Sowing rules:**
- Counter-clockwise (index increases, wraps past 13 back to 0)
- Skip opponent's store when sowing
- Landing in own store = bonus turn (`bonusTurn = true`, turn does NOT pass)
- Landing in own empty pit + opponent's opposite pit has seeds = capture both

**Move record:** `{ pit, color, bonusTurn: boolean, pits: snapshot, moveNum }`

**AI:** `public/js/ai-mancala.js` — heuristic (store difference + seed distribution)

---

## Layer A′ — Multiplayer Specials (Mahjong, BANG!)

These two are **multiplayer but self-contained**. They do **not** use the 2-player
host/guest `RoomState`, are **not** in `server/handlers/index.js`, and never receive
`game:move`. Do not try to fold them into the Layer A model — if you add another
3+ player game, copy this pattern instead.

| | Riichi Mahjong | BANG! |
|---|---|---|
| Players | 4 (seats filled with AI) | 4–7 (`size`, clamped) |
| Lifecycle | `server/mahjong.js` | `server/bang.js` |
| Rule engine | `server/handlers/mahjong-engine.js` | `server/handlers/bang-engine.js` |
| Page | `/mahjong.html` | `/bang.html` |
| Client | `public/js/mahjong-client.js` | `public/js/bang-client.js` |
| CSS | `public/css/games/mahjong.css` | `public/css/games/bang.css` |
| Room code | 6-character | 6-character |

> Both generate a 6-character code from the same ambiguity-free alphabet
> (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no I/O/0/1). Note that the Mahjong helper is
> **named `code4()` but emits 6 characters** (`server/mahjong.js`); trust the loop bound,
> not the name.

**Shared socket shape** — both use an identical 5-in / 5-out event set:

```
client → server:  <ns>:create   <ns>:join   <ns>:start   <ns>:action   <ns>:reconnect
server → client:  <ns>:created  <ns>:joined <ns>:room    <ns>:reconnected  <ns>:error
```

where `<ns>` is `mahjong` or `bang`. `<ns>:room` is the full state broadcast — the client
re-renders from it rather than applying diffs. Both rate-limit actions at 40 per 10s and
clean up idle rooms after 30 minutes.

**Shared room shape:**
```
room.code      — string (4 or 6 chars)
room.status    — 'waiting' | 'active' | 'finished'
room.seats[]   — { type:'human'|'ai', name, socketId, token, connected } | null
room.hostSeat  — seat index of the host
room.game      — engine state (null until started)
room.actionTimer / aiTimer / cleanupTimer
```

### mahjong — `mahjong:action` payloads

`{ a, t, tiles }` — accepted depending on `game.phase`:

| Phase | Actions |
|-------|---------|
| `turn` (your turn) | `discard` (`t`=tile), `riichi` (`t`=tile), `tsumo`, `ankan` (`t`=tile) |
| `calls` (reacting to a discard) | `ron`, `pon`, `chi` (`tiles`=chosen meld), `pass` |

Only offers present in `game.pending.offers[seat]` are honored — the server ignores calls
the seat was not actually offered. Engine exports include `shanten`, `isWinningHand`,
`evaluateWin`, `scoreOf`, `countDora`, `buildWall`.

### bang — `bang:action` payloads

`{ a, idx, target, cards, pass, pick }`:

| Situation | Actions |
|-----------|---------|
| Your turn, no pending queue | `play` (`idx`=hand index, `target`=seat), `end`, `sid` (`cards`=2 hand indices) |
| You are the actor of `game.queue[0]` | `react` (`cards`, `pass`, `pick`) |

Roles are sheriff / deputy / outlaw / renegade (`ROLE_KO` for Korean labels). Card effects
implemented in `server/bang.js` include bang, missed, beer, saloon, duel, indians, gatling,
panic, catbalou, jail, dynamite, stagecoach, wellsfargo, store. Range/targeting uses
`distance()` and `weaponRange()` from the engine, which account for seating and
Mustang/Scope-style modifiers.

**Reaction queue (`game.queue`)** — one item at a time; `queue[0].actor` is the only seat
allowed to send `react`. `publicPending()` exposes the item's detail to that seat only;
everyone else sees `{type, actor, waiting:true}`. Item types:

| `type` | Who responds | `react` shape | Meaning |
|--------|--------------|---------------|---------|
| `bang` / `gatling` | target | `cards` (Missed!) or `pass` | Barrel/Jourdonnais Draw! runs automatically first |
| `indians` / `duel` | target | `cards` (BANG!) or `pass` | Duel re-queues onto the other player |
| `lethal` | dying player | `cards` (Beer) or `pass` | Only opens when >2 players are alive |
| `store` | each player clockwise | `pick` | General Store |
| `discard` | turn player | `cards` | End-of-turn hand limit = current HP |
| `steal` | **the card player** | `pick` (index into `options`) | Panic!/Cat Balou target choice — see below |
| `kit` | turn player | `pick` (card to return) | Kit Carlson draw |
| `jesse` / `pedro` | turn player | `pick` (index into `options`) | Alternative draw source |

**Panic! / Cat Balou** follow the official rule: you choose *where* to take from, and only
the hand is random. `stealOptions()` builds `{kind:'hand'} | {kind:'equip',i,card} |
{kind:'jail',card} | {kind:'dynamite',card}` — Jail and Dynamite are cards in play, so
Cat Balou can free a prisoner. With only one option the server resolves it immediately and
never enqueues.

**Characters** — all 16 from the base game live in `bang-engine.js` `CHARACTERS`. Ten are
passive (Bart Cassidy, Black Jack, Calamity Janet, El Gringo, Lucky Duke, Paul Regret,
Rose Doolan, Slab the Killer, Suzy Lafayette, Willy the Kid); Jourdonnais (built-in Barrel)
and Vulture Sam (inherits an eliminated player's hand + equipment) are also automatic. The
remaining four need input: Kit Carlson, Jesse Jones and Pedro Ramirez each replace the draw
step with a queue item, and Sid Ketchum uses the separate `sid` action.

> Deviation from the printed rules: Sid Ketchum's ability is "any time" on the card but is
> restricted here to his own turn — the lethal-damage window stays Beer-only.

**Visual effect stream** — `state.fx` is an array of already-public events describing what
just happened (`shot`, `duel`, `damage`, `heal`, `draw`, `explode`, `death`), emitted so the
client can animate rather than only log. It is cleared after every broadcast, so a state
push never replays stale effects, and it is safe to send identically to every seat.

**Testing:** covered by `npm run test:games` (part of `npm run check`), which runs
`prototypes/mahjong-engine-test.js`, `mahjong-flow-test.js`, `mahjong-timer-test.js`, and
`bang-flow-test.js`. Each is also runnable on its own with `node <path>`. Plain `npm test`
only asserts that the two pages and their client scripts return 200.

---

## Layer B — Arcade Games (9 games)

All arcade games: standalone IIFE in `public/arcade/<name>/game.js`, no server events,
no `game-registry.js` entry. Each is reachable at `/arcade/<name>/`.

| Game | Path | Mechanic | Key Constants | Storage Keys |
|------|------|----------|---------------|--------------|
| **snake** | `/arcade/snake/` | Grid snake; grow by eating apples | `GRID=20, TICK=120ms` | `arcade_snake_high` |
| **breakout** | `/arcade/breakout/` | Ball + paddle; power-ups (multi-ball, wide, laser) | `BRICK_ROWS=6, BALL_SPEED_INIT=5` | `arcade_breakout_high` |
| **vampire** | `/arcade/vampire/` | Top-down survivor; **weapon leveling (1-5) + evolution** (max weapon + passive → evolved super-weapon); 5 base + 5 evolved weapons | `SURVIVE_GOAL=600s, MAX_ENEMIES=120, MAX_WEAPON_LEVEL=5`; `EVOLUTION_DEFS` | `vps_meta_v2`, `vps_run_snapshot_v1`, `vps_muted` |
| **plant** | `/arcade/plant/` | 식물 키우기 — clicker idle; 9 growth stages; 5 upgrade types | `STAGES[9], UPGRADES[5]` | `plant_save_v1` |
| **tower-defense** | `/arcade/tower-defense/` | Center-defense TD; 3 tower types + adjacency synergies. **⚠️ Engine lives in `sandbox/tower-defense/`** — see note below | `TD_CONFIG.*` (see Layer C) | `td_published_config` |
| **factory** | `/arcade/factory/` | 산업의 시대 — spatial automation; production chains, era breakthroughs, stability gates | `BELT_SPEED=2.2, DEPOSIT_MIN=600, ERA_STABILITY_SEC=5, GEN_FUEL_CAP=20` | `arcade_factory_save_v1`, `arcade_factory_high` |
| **bootstrap** | `/arcade/bootstrap/` | 문명 키우기 — civilization clicker/idle; era actions charge a Golden Age multiplier | `TICKS_PER_SEC=2` | `civ_save_v2`, `civ_best_v1`, `civ_muted` |
| **jackpot** | `/arcade/jackpot/` | 월세 잭팟 — slot roguelite; spin to make rent, deck-building between rounds | `ROWS=3, COLS=4, BASE_SPINS_PER_RENT=4, DECK_CAP=30, EVENT_CHANCE=0.10` | `arcade_jackpot_muted` |
| **neon-cascade** | `/arcade/neon-cascade/` | Chain-explosion arcade; timed rounds, limited charges | `WIDTH=720, HEIGHT=1000, ROUND_SECONDS=45, MAX_CHARGES=4, PULSE_RADIUS=118, RECHARGE_SECONDS=4.5` | `neon_cascade_high_v1`, `neon_cascade_chain_v1`, `neon_cascade_mute_v1` |

Several arcade games ship a headless `sim.js` (`bootstrap`, `jackpot`, `neon-cascade`)
so their economy can be balanced from Node — see `prototypes/` for the runner scripts.
These are **not** part of `npm test`.

> **⚠️ tower-defense is the exception to "arcade games are self-contained."**
> `public/arcade/tower-defense/` holds only `index.html`. It loads the engine from
> `sandbox/tower-defense/` via an Express alias mounted at `/arcade/tower-defense/runtime/`
> (`server/index.js`). Editing `sandbox/tower-defense/{config,game,ui}.js` therefore
> **changes production**. Verify such edits at `/arcade/tower-defense/`, not only in the
> sandbox editor.

**Adding a new arcade game:** See `ADDING_AN_ARCADE_GAME.md` — and add the new route to
`ROUTES` in `scripts/smoke-test.js`.

**AdMob:** `window.AdMob.showInterstitial()` (from `/js/admob.js`) — no-op on web, live in Android build.

---

## Layer C — Sandbox Tools (3 tools)

All sandboxes: config-driven, dev-only (`npm run sandbox` → `http://localhost:3001`). NOT served in production.

| Sandbox | Path | Game modeled | Config object | Notable features |
|---------|------|-------------|---------------|-----------------|
| **vampire-survivors** | `sandbox/vampire-survivors/` | Top-down survivor | `window.VS_CONFIG` | Stage editor, skill designer, enemy types, probability curves |
| **plant-growing** | `sandbox/plant-growing/` | Idle clicker | `window.PG_CONFIG` | Growth stages, upgrade tree, idle income curves, visitor system |
| **tower-defense** | `sandbox/tower-defense/` | Center-defense TD | `window.TD_CONFIG` | 10 stages + infinity; **3 tower types** (cannon/frost/tesla); **adjacency synergies** (Shatter/Overload/Cryo-Charge); 5-level upgrades, 12 passives |

**Sandbox architecture (all three):**

```
sandbox/<name>/
├── index.html          — canvas (800×600) + 320px editor panel + modal overlay
├── config.js           — window.<X>_CONFIG (live) + window.<X>_DEFAULTS (frozen reset copy)
├── game.js             — window.<X>Game — game loop + state machine, reads config every frame
├── ui.js               — window.<X>UI — 7 editor tabs, sliders, charts, persistence
└── graphics/
    ├── theme.js        — window.TOKEN_MAP, resolveToken(), tokenColor(), tokenEmoji()
    └── sprites.css     — rarity borders, token color classes
```

**Script load order:** `theme.js → config.js → game.js → ui.js`

**Common patterns:**
- `sliderField(label, val, min, max, step, dotPath)` — renders slider bound to config path
- `setNestedPath(obj, 'TOWER.cost', val)` — writes into config by dotted path
- Persistence: `localStorage['sandbox_<x>_config']`, debounced 2s auto-save, 10 named snapshots
- Export: JSON file download; Import: file picker → `deepMerge` into config

**Tower Defense specifics (`TD_CONFIG`):**
```
TD_CONFIG.STAGES[10]           — each has waves[] array
TD_CONFIG.TOWER.upgradeLevels[5] — cannon; Lv4 special='arc', Lv5 special='void'
TD_CONFIG.TOWER_TYPES          — { frost, tesla } extra tower types (attack: 'frost'|'tesla')
TD_CONFIG.SYNERGIES[3]         — adjacency combos { id, a, b, radius, bonus }
TD_CONFIG.PASSIVES[12]         — stackable, multiplicative
TD_CONFIG.BASE_CAPACITY        — 20 (lose when mobs reaching base >= this)
TD_CONFIG.BASE_RADIUS          — 35px (exclusion zone = BASE_RADIUS + 20)
```
Engine: `getTowerCfg(tower)` resolves per-type config; `recomputeSynergies()` runs on
place/sell/upgrade and stamps each tower's `.synergy` bonus + `.synergyIds`.
`placeTower(x, y, type)`, `setPlacingMode(on, type)`, `getActiveSynergies()`.

---

## Cross-layer reference

| Key file | Layer | Purpose |
|----------|-------|---------|
| `server/handlers/index.js` | A | Registry: `new Map([['chess', require('./chess')], ...])` |
| `public/js/game-registry.js` | A | Frontend metadata for all 12 games (names, icons, rules text) |
| `server/events.js` | A | Socket dispatch: `handler.handleMove(socket, room, role, data)` |
| `server/endgame.js` | A | `endGame(room, winner, reason, extras)` — call to finish any game |
| `public/js/game.js` | A | Frontend orchestrator — routes socket events to `GameHandlers[gameType]` |
| `public/index.html` | A+B | Lobby — board game cards + arcade section |
| `public/arcade/*/game.js` | B | Each arcade game — single IIFE, ~300-700 lines |
| `sandbox/*/config.js` | C | Each sandbox config — `window.*_CONFIG` + `window.*_DEFAULTS` |
| `scripts/smoke-test.js` | A+B | 82 assertions — handlers, room state, HTTP routes for all layers |
| `server/mahjong.js` / `server/bang.js` | A′ | Self-contained table lifecycles — **not** in the handler registry |
