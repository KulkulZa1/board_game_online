# Changelog

## [Unreleased] - Vampire Survivors director-loop readiness

### Added
- Character selection, difficulty selection, local meta progression, permanent upgrades, daily challenge, map unlocks, pause UI, survival win resolution, and rewarded ad hooks for `/arcade/vampire/`.
- Tower Defense hybrid loop for `/arcade/vampire/`: players can place Cannon/Frost/Tesla towers during runs with rechargeable tower charges.
- Achievement coin rewards and end-run evolution reports that show missed evolution plans, lowest HP, and tower placements.
- Sandbox Vampire Survivors evolution mirror: `sandbox/vampire-survivors/` now has config-driven evolved skills, editable evolution recipes, golden evolution level-up cards, passive prerequisites, and a runtime smoke check that verifies `orb + spinach -> blackhole`.
- Native monetization boundary for `/arcade/vampire/`: ad-removal ownership suppresses interstitial ads, restore purchase is exposed, and locked premium characters can be unlocked through the purchase helper when a Capacitor billing plugin is present.
- Production-safe Tower Defense arcade runtime path: `/arcade/tower-defense/` now loads reused TD engine files from `/arcade/tower-defense/runtime/` instead of broken `/sandbox/...` URLs.
- Tower Defense sandbox-to-arcade publish/import flow: the editor validates configs, saves `td_published_config`, exports `td-published-config.json`, and the arcade route prefers published config before draft/default config.
- Tower Defense game-first pass: `/arcade/tower-defense/` now has a direct play button, quick tower build controls, a Meteor active ability, visible enemy lanes, tower firing/aura feedback, paid passive rerolls, mobile tap placement, and a more generous 160g opening economy.
- Vampire Survivors mid-run resume: active runs save locally on start, pause, periodic play, revive, visibility change, and page unload; valid saved runs can be continued from the start overlay.
- Vampire Survivors co-op relay MVP: a host can create a shareable Socket.io co-op room, a guest can join from `?vpsRoom=...`, control an ally in the host simulation, and receive a compact live state mirror.
- Vampire Survivors evolution planning UI: start, pause, and level-up surfaces now show recipe progress so failed or near-ready evolutions are visible during the run.
- Vampire Survivors evolution payoff: successful evolutions now trigger a transient banner, stronger particle burst, screen shake, and a defensive WebAudio chime.
- Vampire Survivors level-up tension: non-evolution cards now use weighted selection and visible reason tags such as `Build starter`, `Power up`, and `Combo passive`.
- Vampire Survivors near-miss feedback: low health now triggers throttled `LOW HP` / `CRITICAL HP` alerts, a pulsing player ring, edge vignette, and a critical HP bar state without stacking warnings every frame.
- Vampire Survivors hack-and-slash layer: level-up choices can now add `Cleave Edge`, `Rupture Mark`, and `Echo Step` slash supports that widen dash slashes, apply bleed/burst pressure, and create delayed after-slashes.
- Smoke-check coverage for Vampire Survivors character/difficulty/meta/pause/revive markers.
- `docs/vampire-survivors-director-loop.md` with verification targets and remaining design work.
- `docs/loop-progression-technical-spec.md` with programmer-facing data structures, simulation variables, update rules, era-loop stability checks, breakthrough rules, and MVP implementation scope for the civilization-scale progression system.
- Bootstrap civilization-loop arcade MVP at `/arcade/bootstrap/`, with data-driven eras/processes, bottleneck diagnostics, stability-gated era unlocks, mobile-friendly DOM UI, and smoke-check coverage.
- Plant Growing idle loop: growth burst action, data-driven breakthrough bonuses, loop summary panel, and mobile-friendly progression UI for `/arcade/plant/`.
- NEON CASCADE at `/arcade/neon-cascade/`: a 45-second one-touch chain-reaction game with deterministic simulation, assisted pulse targeting, rechargeable actions, special cores, wave goals, and score-tripling Overdrive.
- BANG! now ships all 16 base-game characters. Jourdonnais (built-in Barrel) and Vulture Sam (inherits an eliminated player's hand and equipment) resolve automatically; Kit Carlson, Jesse Jones and Pedro Ramirez replace the draw step with a choice, and Sid Ketchum trades two cards for a life through a dedicated `sid` action.
- BANG! visual effect stream: the server reports what just happened (`shot`, `duel`, `damage`, `heal`, `draw`, `explode`, `death`) in `state.fx`, and the client animates bullet tracers, avatar shake with floating damage numbers, centre-table Draw! reveals, and elimination bursts, with procedural Web Audio sounds and a mute toggle.
- BANG! round table UI: opponents sit around an oval felt with perspective-scaled seats, dashed range lines and distance labels while targeting, fanned card backs for hand size, deck/discard stacks, and a collapsible log ticker.
- Snake is now a roguelite. Every level-up drafts 1 of 3 mutations (18 in the pool), specific pairs fuse into 5 evolutions that consume their materials, cursed picks trade a real drawback for power, obstacles close in from Lv.5, and a finished run pays out 🐚 scales that buy 5 permanent upgrades between runs. Rules and balance live in a headless `public/arcade/snake/sim.js`.
- Breakout is now a roguelite too, built from its own nouns rather than copied from snake: each cleared stage drafts 1 of 3 gear pieces (18 in the pool) acting on the ball, paddle and bricks, 5 fusions consume their materials, cursed gear buys score with a real cost (glass cannon locks you to one life), and 🔩 shards buy 5 permanent upgrades between runs. Rules and balance live in a headless `public/arcade/breakout/sim.js`.
- NEON CASCADE gains amplifiers. Because it is a 45-second round, the draft opens *only before* a round rather than interrupting it; picks then accumulate across consecutive rounds up to a cap of 4, and that accumulation is the "one more run" hook. 10 amplifiers act on orbs, charges, chain and fever, 3 fuse, and two cursed picks buy score for a smaller charge cap or a shorter round.
- 식물 키우기 gains prestige (환생). Reaching the flower stage unlocks cashing a run in for 🌰 essence, which buys 5 permanent traits (growth rate, passive sun, starting resources, essence yield, and starting stage). The run resets, but achievements, breakthroughs, star, essence, traits and the rebirth count are explicitly preserved, and the wipe always goes through a confirmation showing exactly what is lost and gained.
- 월세 잭팟 expands from a slot roguelite into a roguelike with a run-to-run layer. Before each run you pick a tenant (6 starting archetypes — 2 free, 4 unlocked with 🏠 deeds) and an ascension tier (10 cumulative difficulty modifiers, each unlocked by winning the one below). Every run pays deeds whether you win or lose, so a failed attempt still moves the meta forward.
- Jackpot gains a legendary build. 🏙️ 건물주 is a mythic symbol that never appears in a draft — it is born only by holding 용, 사장님 and 보름달 all at max level at once, which is nine copies of three specific rares. It pays +40 and doubles every adjacent payout, so a centrally fixtured 건물주 flips the whole board. Measured at 0% across 400 normal runs and reachable around spin 63–129 for a bot hunting the parts in endless mode.
- Jackpot route selection becomes a Slay-the-Spire-style map. The whole neighbourhood graph is generated at run start and shown up front — 2–4 branching lanes per floor converging on a single finish — so you can plan several floors ahead instead of picking blind from two or three cards each time. Connecting edges are drawn so the branches are actually readable, the current position and reachable nodes are highlighted, and a 🗺️ button opens the full map at any time. A new 시장 node type pays coins on arrival.
- Jackpot's map now actually branches. The first version averaged 1.66 onward options per floor and left 40% of floors with a single exit — a corridor with map art. Generation now hands out two onward nodes by default, three sometimes and one only occasionally, lifting the average to 1.86 with 19% single-option floors (11% once the forced convergence at the finish is excluded). Verified by real browser play, clicking the map nodes themselves: 2.02 average options per floor, no console errors, no fallback to the card list.
- Card buttons in jackpot's symbol/route/relic modals and the map nodes carry `data-id` / `data-type`, so automated balance runs pick by identity instead of guessing from label text.

### Changed — tower-defense rebuilt from scratch as 첨탑 대란
- **The arcade Tower Defense was judged not fun and measured as such** — the page was literally the sandbox editor (English dev UI, Import/Export/Publish toolbar, an editor panel eating a third of a phone screen) with a Play button; a scripted player lost with **0 waves cleared**, tower placement failed silently, and `lives` wasn't even in the exposed state. Verdict: not fixable by tuning — it isn't a game page.
- **Replaced with 첨탑 대란**, a self-contained path-defense roguelite built on this session's measured pillars: 6 towers × 3 levels with **fusion** (adjacent same-type Lv3 pairs consume one to become 6 evolved towers), a **1-of-3 loot draft** after every cleared wave (9 perks, 3 curses with real costs), bosses every 5th wave, a next-wave preview so placement is planning, and **🔮 mana cores** (√score payout — the anti-inflation lesson) buying 5 permanent studies. Headless `sim.js` + `td-rogue-test.js` (45 assertions) pin the rules and the balance shape: bot median ~24 waves, full-meta ~29–32, and a quadratic late ramp guarantees no infinite survival (the first sweep had 48% of runs surviving forever at the cap — the wall was added and is now asserted).
- Verified by real-browser play driving the actual DOM (canvas taps, build buttons, draft cards, fusion): 26 waves in one continuous run, boss fights, clean game-over → meta payout, zero console errors.
- The sandbox TD editor is untouched and keeps its publish flow; the `/arcade/tower-defense/runtime/` alias stays for the editor, and a smoke-check gate now rejects any reappearance of runtime/ (editor engine) assets in the arcade page.

### Changed — bootstrap & factory, measured by actually playing
- **Bootstrap's Golden Age was worth exactly nothing to a competent player.** A scripted sane build order wins all four era gates in 842 ticks (7 minutes at 1×) with zero clicks — and adding a click every second changed the win time by 0 ticks, because the Golden Age only multiplied production (×1.8) and production is never the bottleneck; the real clocks are population growth, writing, and skill conversion. Golden Age now also runs those civilization clocks at ×1.5, so active play wins ~30% sooner (t=586) while the pure-idle path is untouched. Pinned by the new `bootstrap-loop-test.js` (9 assertions), which plays a full scripted run both ways and requires the ≥15% speedup.
- **Bootstrap's first-gate advice was a trap.** Construction spends food, so a player who follows "채집 캠프를 늘리세요" while the gate wants a food *buffer* of 45 keeps draining it — measured as a permanent soft-lock (buffer oscillating 34–40 for 6,000 ticks). When food income is already in surplus, the gate advice now says to *stop building* and let the buffer fill.
- **Factory verified through era 3 by scripted real-browser play** (a QA bot placing real buildings via a `?debug=1` hook): era 1 clears in ~1:12 game time with the minimal line; eras 2–3 clear once the chain, power and one RP upgrade are in place. No balance wall found — the earlier "stuck at 0 motors for 12 minutes" was the bot's mis-wired belt, not the game. The hook (build/inspect/deposits/upgrade/clear) stays for future QA; documented the "counter full but era not advancing = missing 개량 설비 upgrade" trap in GAMES.md.

### Changed — vampire survivors, measured by actually playing
- **Running in a straight line was a zero-risk win.** Every enemy is slower than the player (max 75 vs 160 px/s), so a bot that simply held one direction won the full 10-minute survival with 27 kills and zero damage after minute 2 — the game degenerated into an eight-minute jog with no XP, no drafts, no danger. The classic genre fix is now in: enemies that fall more than 900px behind are repositioned into a ±90° fan 560–720px ahead of the player's heading, throttled as a stream whose rate scales with how many enemies have been left behind (`enemyRepoBudget`) — a player circling their ground barely triggers it, a marathon runner turns it into a wall. Tuned across five real-browser iterations: the first version (unthrottled, 380px ring) killed even competent kiting at 49–78 seconds; the final numbers leave a straight-line runner bleeding steadily while a gap-seeking kiter on a fresh account reaches 3–4½ minutes at Lv13-14 with 800-1,000+ kills — quadruple the action density of the jog, with meta upgrades as the intended path deeper. Gated by a smoke-check marker.
- **Gear pickups no longer stack two overlays.** Picking up a gear drop paused via the pause menu, which rendered a visible-but-unclickable Resume button *behind* the comparison modal (found because it blocked automated clicks too). The gear modal now pauses silently; its own equip/dismantle/drop buttons resume.
- Vampire exposes a `state()`/`grid()` QA hook behind `?debug=1`, same pattern as snake/breakout.

### Changed — arcade balance pass, measured by actually playing
- **Plant's economy was three-quarters dead.** On a fresh save, sun, nutrient and star could only be earned via upgrades priced in *themselves*, so all three sat at 0 forever — 5 of 7 upgrades, 3 of 5 breakthroughs and the growth-burst button were permanently locked (confirmed by a 90-second real-browser session: every secondary resource pinned at 0). Clicks now earn a trickle of sun and nutrient (`CLICK_YIELD`) and every stage-up pays a celebration bundle of all four resources (`stageBundle`), both in `sim.js` and pinned by tests that walk a fresh save to affording 비료 and 태양광 패널. In the same 90-second replay: 31 growth bursts, 32 purchases, every resource flowing.
- **Snake's scale payout was hyperinflating.** score/120 linear payout let one measured god run pay +6,086 🐚 — the whole 5-upgrade shop costs ~1,160, so meta progression ended in a single run. The base component is now √score: the same god run pays ~680, a typical run 60–120, and tests pin that even a 650K-score run pays less than the full shop. Breakout's 🔩 payout had the identical failure shape and got the identical fix.
- **Breakout stage 1 was unclearable in a fun amount of time.** Real play showed three compounding problems: the ⏱ slow power-up multiplied ball velocity by 0.7 *permanently and stacking* (four catches → 0.24× speed, measured 5.0 → 1.2); balls locked into deterministic bounce loops that touched no brick for 80+ seconds; and a 60-brick wall from stage 1 meant the first draft arrived after 2½ minutes. Slow is now a 6-second timer that doesn't touch velocity; ceiling bounces get ±1.5° jitter, near-vertical paddle returns are widened, and an anti-stall kick rotates the ball if nothing has been hit for 7 seconds; stages open thinner and grow back to full depth; balls speed up 2% per paddle hit (capped at 1.6×). Post-fix diagnostic: steady brick progress the whole run, no stalls.
- **NEON CASCADE's rounds never ended for a competent player.** Real play with the game's own smart-pulse assist ran a single "45-second" round past 300 seconds at 9M+ points: every pulse chain-percolated the entire 52-orb field (explosion reach ~109px vs ~55px mean orb spacing), and time income — +6s per wave, +2.5s per time orb (~6 per wave), +3s per fever (several per wave) — permanently out-earned the clock, so the between-round amp draft loop was unreachable. Now: chain explosion radius 96 → 72 (fever keeps 118, staying the full-screen-wipe moment), wave time bonus decays to zero by wave 8, time-orb bonus decays with wave, fever grants no time at all, the time bank caps at 45s, and wave/chain charge awards are halved. Verified in real browser play: rounds end at 105s / 141s even for a superhuman pulse-spam bot, with amps still extending the second round — finite rounds, draft loop restored.
- **Breakout stage 1 opens at 3 brick rows** (growing one per stage to 6) and the power-up drop rate is 0.18 → 0.24 — with the speed ramp, a no-luck single-ball stage 1 now resolves in ~60–95s instead of 150s+, and multiball luck pulls it under 40s.
- Snake and breakout expose a `grid()` QA hook behind `?debug=1` so browser-driven balance runs can read real positions instead of scraping pixels.

### Fixed
- `sw-update.js` threw on every page load over an insecure origin. It guarded with `'serviceWorker' in navigator`, which is true even where the API is unusable — on plain http against a LAN IP (exactly how this repo is dev-tested on a phone) Chrome keeps the prototype key but leaves the property undefined, so the very next line blew up and took the rest of the script with it. It now checks the value. Caught by a real-browser balance run and gated by a smoke-check assertion.

### Fixed
- Jackpot's deck cap only applied to some card sources. `pick()` checked the `DECK_CAP` constant instead of the run's own cap, so the collector's +10 never materialised on drafts and, worse, ascension deck penalties were unenforceable — an ascension 10 player capped at 15 could still draft up to 30.
- Jackpot ascension tiers 9 and 10 were beyond reach (2% and 0% for the tuned bot). Both now sit at 3–4%, which a player who plans fixtures and synergies clears comfortably. The capstone no longer extends the run length: moving the target to 11–12 rents multiplies against a rent curve that grows 1.5× per stage, so it squeezes the deck and jackpot odds instead.

### Fixed
- Jackpot's ascension ladder collapsed at tier 5 and its tenants were a power ranking rather than sidegrades — both found by actually playing the game rather than reading the numbers. Tier 5 cut the spin cycle from 4 to 3, which multiplies against the rent curve and took the win rate from 12% to 1.5%, with tiers 6-10 all sitting at a flat 0%; the ladder is now a smooth descent (~33% → ~2% → 0% at the capstone) with the finish line moving to 12 rents at the top instead. Tenants ranged from 34% to 66.5%; they now sit inside a 32-43% band. `prototypes/jackpot-balance-sweep.js` is added so the next person can measure instead of guess.

### Fixed
- `npm run check` was failing on `main`. Two gates in `scripts/smoke-check.js` pinned exact version strings — the service worker cache name (`boardgame-v11`) and each arcade page's `?v=` query — so bumping either, which is the correct thing to do when assets change, broke the build. They now assert the *intent*: the cache namespace must be v11 or newer, and arcade assets must still carry a `?v=` query that never goes backwards.
- Chess no longer depends on a CDN at runtime. `public/game.html` loaded chess.js from cdnjs, so on a network that blocks it — or an offline PWA that never cached it — `Chess` was undefined and the chess page died on load. The already-pinned `chess.js@0.12.0` from `node_modules` is now served same-origin at `/vendor/chess.js` and precached by the service worker.
- Omok's draw threshold was hardcoded to 225 moves while the board size is selectable (13/15/17/19). A 13×13 game could never end in a draw — the board filled up and every further move was rejected forever — and a 19×19 game was declared drawn with 136 empty points left. It now scales with the board.
- A tie in Mancala, Dots & Boxes, Apple Game and Indian Poker reported the winner as `null`, which the client rendered as "패배" (defeat) to *both* players, played the losing sound, and recorded a loss in local stats. These now report `'draw'`, and the client treats a missing winner as a draw as well.

### Added (tests)
- `prototypes/core-games-handler-test.js` — 40 assertions covering the rules of the nine board games that had no rule tests at all (chess, omok, connect4, othello, checkers, mancala, applegame, battleship, indianpoker), wired into `npm run test:games`. Includes regression coverage for the three fixes above.
- `prototypes/snake-rogue-test.js` — 42 assertions over snake's roguelite layer, also in `npm run test:games`. Beyond rules (evolutions consume their materials, curses cost what they claim, saved meta is sanitised against tampering) it asserts *balance*: across 200 simulated runs builds must actually diverge, evolutions must fire often enough to chase but not by default, and curses must stay a minority of picks.
- `prototypes/breakout-rogue-test.js` — 39 assertions over breakout's roguelite layer, same shape: rules, tamper-proofing of saved meta, guards that a stacked build can never shrink the paddle or stop the ball entirely, and balance across 200 simulated runs.
- `prototypes/neon-amp-test.js` — 32 assertions over NEON CASCADE's amplifiers, including that a round driven through the real `step()` actually reflects each modifier, that the pre-amplifier call signature still behaves exactly as before, and that no combination can shrink the round or the charge cap below a playable floor.
- `prototypes/plant-prestige-test.js` — 52 assertions over the prestige rules, weighted toward the destructive path: that a blocked rebirth returns the original save object untouched, that the input is never mutated, that every record-keeping field survives the reset, and that the essence curve pays enough on the very first rebirth to actually afford a trait.
- `prototypes/jackpot-meta-test.js` — 52 assertions over the jackpot meta layer, including that every tenant and ascension modifier actually reaches the live `Run`, that no combination pushes the spin cycle, deck cap or starting coins below a playable floor, and an autoplay comparison confirming ascension 6 really does end runs earlier than ascension 0.

### Fixed (BANG!)
- BANG! Panic! and Cat Balou now follow the printed rule: the player chooses whether to take from the target's hand (still random) or from a specific card in play. Previously any card in play was unreachable whenever the target held a single hand card, so Barrels, Mustangs, weapons, Jail and Dynamite could never be removed.
- BANG! AI no longer stalls the table after using Sid Ketchum's ability — the turn timer and AI loop are re-armed the same way `playCard` does.

### Changed
- Backgammon now validates a move against the complete remaining roll. Players must use the maximum playable dice count and, when only one distinct die can be played, the higher die.
- Backgammon's pure board and dice rules now live in `server/rules/backgammon.js`, leaving its Socket.io handler focused on room orchestration.
- Texas Hold'em now respects the host/guest color assignment after color swaps, returns unmatched chips on a short all-in, runs out the remaining board automatically, and broadcasts a stopped shared clock during fold/showdown results.
- Texas Hold'em and Dots and Boxes now ignore malformed or null move payloads instead of allowing an untrusted socket event to throw inside the server handler.
- Active Texas Hold'em spectator snapshots now redact both private hands until showdown or game completion.
- Shared, BANG!, Mahjong, and Vampire co-op Socket.io handlers now normalize malformed payloads before destructuring them; the full smoke suite sends null payloads across these boundaries and confirms the server remains usable.
- Texas Hold'em reconnect now restores the requesting player's private hand and complete betting state. A new round dealt while either player is offline keeps its clock paused until both reconnect.
- BANG! now completes a lethal dynamite reaction before advancing the turn. A player saved by Beer resumes the original turn-start draw, while a defeated player advances cleanly to the next survivor; deterministic regression coverage prevents the former AI match deadlock.
- Timed 1:1 rooms now keep the server and displayed game clocks paused until both players reconnect. A lone returning player receives a fresh peer-reconnect grace period and an explicit offline-peer banner; the pending cleanup is cancelled and the clock resumes once both players are back. The banner reserves safe-area-aware space on mobile, and behavioral smoke coverage verifies its display lifecycle plus the complete disconnect and resume transition.
- Active BANG! and Mahjong rooms now cancel their pending empty-room cleanup timer after a successful reconnect, preventing a resumed match from disappearing at the original two-minute deadline. Socket smoke coverage verifies reconnect survival and cleanup after everyone leaves again.
- BANG! and Mahjong now retire expired reconnect tokens without showing a false startup error, and hidden lobby overlays no longer leave invisible enabled controls in the keyboard or assistive-technology path during play.
- BANG! and Mahjong now charge turn time only after a server-validated action succeeds; invalid targets, riichi declarations, and tsumo claims no longer consume a player's time bank. Their 97 headless engine, full-match, and timer assertions now run as part of `npm run check`.
- Lobby board-game cards now use a wider desktop selection surface and a mobile grid action row, preventing vertical `플레이` labels and 390px horizontal overflow while preserving 42px touch targets.
- BANG! and Mahjong now normalize nicknames on the server and escape server-provided names and logs before `innerHTML` rendering, preventing nickname markup injection without weakening their room or solo flows.
- BANG! and Mahjong now load the shared service-worker update helper, so newly deployed clients participate in the same cache refresh flow as the rest of the platform.
- The service worker now bypasses the browser HTTP cache for HTML, JavaScript, CSS, and manifest network-first requests; `boardgame-v11` removes older cached assets during activation.
- Mahjong mobile hands now start from the left edge of their horizontal scroll area, making every tile reachable and tappable instead of stranding the first tiles at negative coordinates.
- Vampire Survivors enemy spawn pressure, enemy stats, boss interval, and rewards now scale from the selected difficulty, selected map, and daily modifier.
- Public `/api/status` now keeps detailed room lists and tunnel URLs loopback-only, and Socket.io no longer defaults to wildcard CORS in production.
- Multiplayer chat now shows real shared-shell speech bubbles on current main and gives visible feedback when chat is rate limited.
- `scripts/check.sh` now matches the dev-only sandbox policy by expecting `/sandbox/` to return 404 and checking the production Tower Defense runtime path instead.
- Factory arcade now prevents dead miner placements, highlights valid resource/connection tiles, auto-connects nearby factory outputs while preserving manual rotation, adds delivery milestone feedback, autosaves/restores factory layouts, improves mobile palette/tool layout, and is covered by the deep smoke-check route/policy assertions.
- Factory arcade era changes now use civilization-style stability gates: target deliveries, required production lines, throughput, and power stability must hold briefly before the next industrial phase unlocks.
- Factory industrial phases now resolve a historical bottleneck through a data-driven breakthrough (`standardization`, `grid coordination`, `programmable control`, and `autonomous optimization`). Each discovery changes the running factory, becomes a required era-gate condition, and is recorded in the industrial chronicle.
- Factory saves now preserve deposit quantities, research points, building tiers, breakthroughs, and chronicle history. Version 1 saves with resource-only deposits migrate safely instead of restoring mines with invalid quantities.
- Bootstrap is now presented as `문명 키우기`, with era-specific direct actions, rapid-tap combos, a Golden Age that boosts all passive production, bounded rest charging on continue, mobile touch controls, and an `F` keyboard command.
- Production WebSocket transitive dependencies were refreshed to `engine.io 6.6.9`, `socket.io-adapter 2.5.8`, and `ws 8.21.0` after the dependency audit reported the older `ws` denial-of-service advisory.
- Snake now rewards fast food chains with multipliers, rare golden food, and a six-second RUSH state; Breakout now tracks destruction combos and triggers score-tripling FEVER every 12 bricks.
- Changed Factory, Bootstrap, Snake, and Breakout asset URLs now carry release versions, and the service-worker cache namespace advances to `boardgame-v10`, preventing an offline fallback from pinning pre-deploy gameplay or CSS after the server returns.
- Bootstrap mobile layout now places onboarding and pause/speed controls before the long build dashboard, keeps Korean guidance words intact, and gives both toolbar and building actions 42px touch targets. Factory save actions and the Neon mute control use the same minimum.
- Render Blueprint now explicitly deploys every commit on `main` instead of inheriting a potentially disabled dashboard auto-deploy setting.

### Documentation
- Added `DESIGN.md`, extracted from the existing platform and arcade visual patterns, to define shared game-shell tokens, responsive rules, feedback states, and reusable progress/action components.

이 프로젝트의 모든 주요 변경사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/) 를 따릅니다.

---

## [Unreleased] — 게임 재미·완성도 강화

### 추가

**뱀파이어 서바이버 (아케이드, `/arcade/vampire/`)**
- 무기 레벨 시스템: 같은 무기를 다시 고르면 최대 5레벨까지 강화 (데미지·투사체 증가)
- 무기 진화 시스템: 최대 레벨 무기 + 필요 패시브 조합 시 진화 무기로 변신
  - 🌀 블랙홀(에너지 구+자석), 🌩 폭풍의 활(화살+쿨다운), ☀ 슈퍼노바(폭발+공격력),
    ☠ 데스레이(레이저+이동속도), 🛡 이지스(방패+체력)
- 레벨업 화면에 황금색 진화 카드 우선 표시, 무기 슬롯에 레벨·진화 상태 표시

**타워 디펜스 (샌드박스, `sandbox/tower-defense/`)**
- 타워 타입 추가: ❄️ 프로스트(광역 둔화), ⚡ 테슬라(즉시 연쇄 번개) — 기존 🏰 캐논과 함께 3종
- 인접 시너지 시스템: 인접한 타워 조합으로 보너스 발동
  - 💥 Shatter(프로스트+캐논), 🌩️ Overload(테슬라+테슬라), ❄️⚡ Cryo-Charge(프로스트+테슬라)
- UI: 타워 타입 선택기 + 실시간 시너지 표시 패널

**기타**
- 실시간 멀티플레이 채팅: 보낸 플레이어 바 위에 임시 말풍선 표시
- 스모크 테스트: 채팅 브로드캐스트 트리밍 + 라이브/히스토리 말풍선 동작 검증 추가

### 수정
- 뱀파이어 서바이버: `fireWeapon`의 잘못된 조기 반환 조건으로 무기가 발사되지 않던 버그 수정

### 변경
- 런치 준비 문서: 현재 프로덕션 동작과 Render 재배포가 필요한 브랜치 전용 동작을 분리
- 로드맵: 신규 프로토타입 게임 추가보다 공유 arcade/sandbox 시스템을 우선

### 문서
- `CODEX_TASKS.md`: 코어/폴리시 분업 핸드오프 문서 (샌드박스 VPS 진화 미러, TD 추가 타워/시너지)

---

## [v1.0.0] — 2026-03-28

### 추가

**게임**
- 체스: chess.js 0.12.0 서버 검증, 폰 승급·캐슬링·앙파상 지원
- 오목: 15×15 렌주 룰 (정확히 5개 연결, 장목 무효)
- 사목: 7×6 중력 낙하, 4개 연결 승리
- 오셀로: 8×8 뒤집기, 유효 수 자동 표시·패스 처리
- 인디언 포커: 상대 카드만 보는 심리전, 배팅·레이즈·폴드
- 체커: 강제 점프 룰, 연속 점프, 킹 승격

**기능**
- 실시간 1대1 대국 (Socket.io WebSocket)
- 색상 선택, 제한 시간 설정 (10분/30분/무제한/직접 설정)
- 재접속 지원 (UUID 토큰, 10분 이내 복귀)
- 재대국 기능 (색상 자동 교체)
- 관전자 모드 (방장 승인 방식)
- 실시간 채팅 + 이모티콘
- 대국 복기 (체스 전용, 키보드 지원)
- 사운드 효과 (Web Audio API)
- 관리자 대시보드 (`/admin.html`)
- 개인정보처리방침 페이지 (`/privacy.html`)
- PWA manifest + Service Worker

**인프라**
- Render.com 클라우드 배포 (`https://board-game-online.onrender.com`)
- GitHub 형상 관리 (main/dev 브랜치 전략)
- `render.yaml` 배포 설정
- UptimeRobot 슬립 방지 (14분 핑)

### 보안
- 서버 Rate Limit 추가: `game:resign` (분당 3회), `game:draw:offer` (분당 5회)
- 클라이언트 버튼 보호:
  - 무승부 제안: 5초 딜레이, 3회 초과 시 60초 비활성화
  - 기권: 3초 쿨다운, 이중 전송 방지
  - 인디언 포커 액션: 1.5초 debounce
- 입력 검증: 좌표 범위, gameType 허용 목록, chat 길이 제한
- `.shutdown-key` 파일 권한 `0o600` 적용

### 버그 수정
- chess.js `^0.12.0` → `0.12.0` 버전 고정 (업그레이드 시 API 불일치 방지)
- 인디언 포커 양측 칩 동시 부족 시 오판정 수정
- 체커 재접속 시 이동 불가 버그 수정 (`validMoves` 포함 전송)
- 게임 선택 취소 시 UI 상태 미초기화 수정
- 모바일 터치 타겟 크기 미달 수정 (`min-height: 44px`)
- 오목 360px 기기 가로 오버플로 수정
- 태블릿(481~768px) 게임 카드 그리드 2컬럼 전환

---

## [v1.4.0] — 2026-05-01 (진행 중)

### 추가

**게임**
- 사과게임: 17×10 격자, 합이 10이 되는 사각형 선택·제거, 턴제 멀티플레이 + 솔로 AI
- 배틀십: 10×10 격자 해전, 함선 배치 후 교대 공격, 솔로 AI (hunt-and-target 전략)
- 백가몬: 24포인트 보드, 주사위 2개, 바(BAR)·탈출(borne-off)·더블 완전 구현, 멀티플레이 + 솔로 AI (휴리스틱)
- 텍사스 홀덤: 헤즈업 포커, 블라인드(10/20), 4라운드 베팅, 7카드 핸드 평가(C(7,5)=21조합), 멀티플레이 + 솔로 AI
- 도트앤박스: 5×5 격자, SVG 렌더링, 박스 완성 시 보너스 턴, 멀티플레이 + 솔로 AI (체인 전략)
- 만칼라: 14구멍(pit 0-5 백, 6 백창고, 7-12 흑, 13 흑창고), 반시계 배분, 보너스 턴·캡처 룰, 멀티플레이 + 솔로 AI

**모바일 (Phase C)**
- `capacitor.config.json`: Capacitor 앱 설정, WebView가 Render.com 서버 로드, AdMob 플러그인 연결
- `public/js/admob.js`: 네이티브 앱에서만 동작하는 전면 광고 래퍼 (`Capacitor.Plugins.AdMob`), 웹에서는 무시
- 솔로 모드 게임 종료 후 전면 광고 표시 (`game.js` 연동)
- `BUILDING_ANDROID.md`: Capacitor 초기화 → AdMob 설정 → 서명 AAB 빌드 → Play Store 제출 전 과정 가이드

**아키텍처 개선**
- `server.js` 단일 파일(2,038줄) → `server/` 모듈 폴더로 분리
  - `server/handlers/index.js`: 게임 핸들러 레지스트리 (새 게임 추가 시 1줄 등록)
  - `createRoomState` / `resetForRematch`: 핸들러 플러그인 패턴으로 리팩터링
  - `server/events.js` `game:move` 디스패처: 단일 레지스트리 조회로 단순화
- `game-registry.js`: 게임별 메타데이터(이름·규칙·아이콘·제목) 중앙 집중화
  - `game.js`, `lobby.js`에서 중복 데이터 ~120줄 제거
- `css/games/`: 게임별 CSS 파일 분리 (`game.css` 공유 스타일만 유지)

**문서**
- `ADDING_A_GAME.md`: AI 에이전트·개발자를 위한 10단계 게임 추가 가이드
- `CLAUDE.md` 업데이트: 새 아키텍처 반영

---

## [v1.2.0] — 2026-03-29

### 추가

**혼자하기 (vs AI)**
- 6게임 모두 AI 대국 지원 (체스·오목·사목·오셀로·체커·인디언 포커)
  - 체스: 미니맥스 depth-3 + alpha-beta pruning
  - 오목: 휴리스틱 패턴 매칭 (5목·열린4·막힌4·3 등 가중 점수)
  - 사목: 미니맥스 depth-6 + alpha-beta pruning
  - 오셀로: 미니맥스 depth-4 (구석·안정석 가중치)
  - 체커: 미니맥스 depth-4 + 강제 점프 처리
  - 인디언 포커: 카드 비교 기반 휴리스틱
- 솔로 대국 결과도 개인 전적에 자동 저장

**보드 크기 선택** (오목·사목 — 멀티/솔로 모두)
- 오목: 13×13 / 15×15(기본) / 17×17 / 19×19
- 사목: 5×4 / 6×7(기본) / 7×8 / 8×9

**인디언 포커 룰 개편**
- 카드 범위 A~10 (1~10, 기존 1~13에서 변경)
- A(1) 특수 규칙: 10을 상대로만 이김, 나머지(2~9)에는 최하위
- 10을 가지고 폴드하면 앤티(5칩)만큼 추가 칩 손실 — 페널티 토스트 알림
- 덱 수 선택: 1덱(10장) / 2덱(20장, 기본) / 3덱(30장)
- 승리 조건 선택: ①상대 칩 전부 획득 ②덱 소진 후 칩 많은 쪽 승리
- 멀티플레이 방 생성 시도 동일 옵션 선택 가능

**수기록 패널**
- 체커·오셀로 좌표 표기 오류 수정 (행/열 레이블 정상화)
- 사목 멀티·솔로 수 표기 통일 (열 문자 A–G)
- 체스 무르기 시 수기록 2-span 행 정리 버그 수정

**코드 구조 개선**
- `game.js` 게임별 파일 분리: `game-chess.js`, `game-omok.js`, `game-connect4.js`, `game-othello.js`, `game-checkers.js`, `game-indianpoker.js`

### 보안
- `room:join` rate limit 추가 (1분 10회)
- `room:reconnect` rate limit 추가 (1분 5회)
- 오목·사목·오셀로·체커 좌표 `Number.isInteger()` 검증 강화

---

## [v1.1.0] — 2026-03-28

### 추가
- 게임 규칙 설명 버튼: 로비 게임 카드 + 게임 중 언제든 규칙 확인 (모달)
- 멀티 플랫폼 링크 공유: LINE, Telegram, Web Share API (모바일)
- 개인 전적 기록: localStorage 기반 게임별 승/패/무 통계 모달
- 게스트 프로필: 닉네임 변경, UUID 기반 30일 비활동 시 초기화

### 버그 수정
- iOS 긴 터치 컨텍스트 메뉴 차단 (`-webkit-touch-callout: none`)
- rateLimits Map 1시간 주기 자동 정리 (메모리 누수 방지)

---

## [v1.0.0] — 2026-03-28
