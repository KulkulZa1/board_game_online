# New game candidate review

This project should stay lightweight, browser-friendly, mobile-friendly, and easy to enter from a shared link. New games should reuse the existing room shell, solo flow, arcade HUD, or sandbox content model instead of becoming disconnected prototypes.

## Best next candidates

| Candidate | Mode | Why it fits | Sandbox fit | Estimated cost | Recommendation |
|---|---|---|---|---:|---|
| 2048 / merge puzzle variant | Solo first, async score later | Simple controls, deterministic, fast mobile sessions | Board size, tile values, goals, modifiers | Low | Best next low-risk solo game |
| Reaction-time / chain tap | Solo | Implemented as `/arcade/neon-cascade/`: one-touch chain reactions, short runs, desktop/mobile parity | Orb weights, wave goals, special-core mix | Complete MVP | Tune from playtest data before adding more modes |
| Snake roguelite | Solo | Builds on existing Snake and upgrade ideas | Arena, food, hazards, upgrade pool | Medium | Good if shared upgrade schema is added first |
| Simple card battler | Solo + 1:1 later | Reuses turn-based shell and can support rooms | Decks, enemies, encounters, rewards | Medium | Good bridge between board games and arcade progression |
| Mini auto-battler | Solo + spectator-friendly | Low input pressure, satisfying progression | Units, traits, shop odds, enemy waves | Medium-High | Good later, but needs shared combat simulation tests |

## Japanese riichi mahjong assessment

Full Japanese riichi mahjong is attractive, but it is not a small browser mini-game. It needs 4-player room handling, wall/dead-wall state, calls, furiten, yaku validation, scoring, abortive draws, riichi sticks, honba, round winds, dealer rotation, reconnect-safe hidden information, and strong anti-cheat validation.

Recommended path:

1. Do not implement full multiplayer riichi as the next game.
2. Start with a solo hand trainer or scoring quiz using public hands and deterministic yaku checks.
3. Add a yaku/scoring rules module with tests before any multiplayer UI.
4. Only then consider 4-player rooms, likely after the room model supports more than two seats.

MVP scope if pursued later:

- Solo yaku trainer: show a complete hand, let the user pick winning yaku and score band.
- Local practice hand: draw/discard against a simple wall with no calls.
- Multiplayer riichi: deferred until the server supports 4 seats, hidden-state validation, and reconnect-safe player views.

## Shared systems needed before more games

- Versioned game config schema for arcade and sandbox content.
- Stage validation before saving or loading sandbox data.
- Shared result screen and replay/retry controls.
- Shared mobile input helpers.
- Browser smoke tests for at least one board game, one arcade game, and one sandbox-backed game.
- Production version/cache diagnostics visible enough to confirm Render is serving the expected commit.

