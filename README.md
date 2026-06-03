# Leduc Hold'em — Play vs AI

A browser-based Leduc Hold'em game where you play against strategies trained with Counterfactual Regret Minimization (CFR).

Leduc Hold'em is a simplified poker variant designed for game theory research. The deck has 6 cards — two each of Jack, Queen, King. Each player is dealt one private card and antes 1 chip. There are two betting rounds (Round 1 bet = 2 chips, Round 2 bet = 4 chips, max one raise per round) with a public card dealt between them. A player with a pair (private card matches the public card) beats a player with a high card; ties are broken by rank.

The interesting part: all 11 AI strategies play the same game, but each agent observes a different amount of information. Some know their exact hand relative to the board. Some only know if they have a pair. One plays completely blind. This makes it a practical demonstration of how **information abstraction** changes game-theoretic optimal play.

No installation required — static HTML/JS, no build step.

## Rules

**Deck:** 6 cards — Jack, Queen, King, two of each (J < Q < K).

**Setup:** Each player antes 1 chip. Each is dealt one private card face-down.

**Round 1:** Players bet with a fixed bet size of 2 chips. Maximum one raise per round. Actions in order: Check, Bet, Call, Raise, Fold.

**Public card:** After Round 1, one card is dealt face-up from the remaining deck.

**Round 2:** Players bet again with a fixed bet size of 4 chips. Maximum one raise per round.

**Showdown:** If neither player folded, hands are compared:
- A **pair** (private card matches the public card rank) beats a **high card**
- If both players have a high card, the higher rank wins
- Ties split the pot

Both players can never have a pair simultaneously — the public card is dealt from the remaining 4 cards, so if both private cards are the same rank, that rank is already exhausted.

## Play

Serve the directory over HTTP and open `index.html`:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Strategies

### CFR strategies

Trained with vanilla Counterfactual Regret Minimization at 100,000 iterations. Each converges to a Nash equilibrium for its particular information abstraction — meaning no opponent can exploit it *given what it can observe*. The strategies differ only in what their `info_state_key` contains; the game tree, rules, and payoffs are identical.

| Strategy | What the AI observes |
|----------|----------------------|
| `exact` | Private card + exact public card rank |
| `relative` | Private card + whether public card is higher, lower, or a pair |
| `pair` | Private card + whether it makes a pair with the public card |
| `card_only` | Private card only — ignores the public card entirely |
| `board_only` | Public card only — ignores its own private card |
| `pair_only` | Pair/no pair only — knows neither card rank |
| `blind` | Betting history only — no card information at all |

`exact` is the most informed and plays closest to full-information GTO. Each step down the list removes information, and the Nash equilibrium changes accordingly. The solution is not an approximation of a better strategy — it is genuinely optimal for the information the agent has.

### Fixed strategies

Rule-based, no training required.

| Strategy | Behaviour |
|----------|-----------|
| `abc` | K or pair → always bet/raise; J → check/fold; Q → check/call |
| `random` | Uniform random over legal actions; never folds when check is available |
| `always_call` | Always call or check, never initiates bets |
| `always_raise` | Always raise or bet |

`abc` is the strongest non-CFR strategy. It plays a reasonable hand-strength heuristic and heavily beats strategies that ignore card information (`blind`, `board_only`).

## Reading the strategy files

Each `data/<strategy>.json` maps **info state keys** to **action probabilities**. Fixed strategies (`abc`, `random`, `always_call`, `always_raise`) have empty files — they are implemented directly in code.

### Action history tokens

History strings inside keys are built from single-character tokens:

| Token | Action |
|-------|--------|
| `c` | Check |
| `b` | Bet |
| `ca` | Call |
| `r` | Raise |
| `f` | Fold |

`ca` uses two characters to distinguish Call from Check. All other actions are one character.

---

### `exact`

**Key format:** `{private}|{public}|{R1}|{R2}`

The player knows their private card and the exact rank of the public card.

| Field | Values |
|-------|--------|
| `private` | `J` / `Q` / `K` |
| `public` | `J` / `Q` / `K` / `-` (no public card yet) |
| `R1` | action history of Round 1 so far |
| `R2` | action history of Round 2 so far |

```json
"K|-||":    { "Bet": 0.77, "Check": 0.23 }
"J|-||":    { "Bet": 0.13, "Check": 0.87 }
"J|-|b|":   { "Fold": 0.96, "Call": 0.01, "Raise": 0.03 }
"K|J|cc|":  { "Bet": 0.91, "Check": 0.09 }
"J|K|cc|":  { "Bet": 0.04, "Check": 0.96 }
"K|K|cc|":  { "Bet": 0.97, "Check": 0.03 }
```

K bets frequently from the start (strong hand). J mostly checks and folds to bets. K with J public (K beats J) bets 91% in Round 2. J with K public (J loses) almost never bets. K with K public (K pair — strongest hand) bets 97%.

---

### `relative`

**Key format:** `{private}|{board}|{R1}|{R2}`

The player knows their private card and how the public card compares to it — but not its exact rank.

| Field | Values |
|-------|--------|
| `private` | `J` / `Q` / `K` |
| `board` | `higher` (pub > card) / `lower` (pub < card) / `pair` / `-` |
| `R1` | action history of Round 1 so far |
| `R2` | action history of Round 2 so far |

```json
"K|-||":        { "Bet": 0.77, "Check": 0.23 }
"K|lower|cc|":  { "Check": 1.0, "Bet": 0.0 }
"K|pair|cc|":   { "Bet": 0.97, "Check": 0.03 }
"J|higher|cc|": { "Bet": 0.04, "Check": 0.96 }
```

K with a "lower" public card checks in Round 2 — it knows the board is lower than K, but Q also maps to "lower" when the board is J. The merged bucket plays conservatively. K with a pair bets almost always. J with a "higher" board (losing scenario) rarely bets. Lossless relative to `exact` in expected value against fixed opponents, but the Nash equilibrium differs because the merged information set changes the bluffing structure.

---

### `pair`

**Key format:** `{private}|{board}|{R1}|{R2}`

The player knows their private card and only whether they have a pair — not the board rank.

| Field | Values |
|-------|--------|
| `private` | `J` / `Q` / `K` |
| `board` | `pair` / `no_pair` / `-` |
| `R1` | action history of Round 1 so far |
| `R2` | action history of Round 2 so far |

```json
"K|-||":        { "Bet": 0.77, "Check": 0.23 }
"K|pair|cc|":   { "Bet": 0.95, "Check": 0.05 }
"K|no_pair|cc|":{ "Bet": 0.45, "Check": 0.55 }
"J|pair|cc|":   { "Bet": 0.91, "Check": 0.09 }
"J|no_pair|cc|":{ "Bet": 0.04, "Check": 0.96 }
```

A pair is the dominant signal — J with a pair bets 91%, K without a pair is roughly indifferent. Without knowing the opponent's likely range from the board rank, the strategy is more cautious when no pair is present.

---

### `card_only`

**Key format:** `{private}|{board}|{R1}|{R2}`

The player knows their private card but treats the public card as unknown — it only knows whether Round 2 has started.

| Field | Values |
|-------|--------|
| `private` | `J` / `Q` / `K` |
| `board` | `pub` (public card exists) / `-` |
| `R1` | action history of Round 1 so far |
| `R2` | action history of Round 2 so far |

```json
"K|-||":     { "Bet": 0.77, "Check": 0.23 }
"K|pub|cc|": { "Bet": 0.56, "Check": 0.44 }
"J|pub|cc|": { "Bet": 0.24, "Check": 0.76 }
```

Round 1 is identical to `exact` (no public card anyway). In Round 2, K still bets more than J because it knows its own rank, but without knowing the board it can't tell if it has a pair. The strategy is more conservative than `exact` or `pair` in Round 2.

---

### `board_only`

**Key format:** `-|{public}|{R1}|{R2}`

The player knows the public card rank but not their own private card. The private field is always `-`.

| Field | Values |
|-------|--------|
| `-` | always `-` (private card ignored) |
| `public` | `J` / `Q` / `K` / `-` |
| `R1` | action history of Round 1 so far |
| `R2` | action history of Round 2 so far |

```json
"-|-||":   { "Bet": 0.39, "Check": 0.61 }
"-|K|cc|": { "Bet": 0.50, "Check": 0.50 }
"-|J|cc|": { "Bet": 0.50, "Check": 0.50 }
```

Without knowing its own card, the agent can't determine hand strength at all. Round 2 strategies converge toward 50/50 — the board rank alone doesn't break the symmetry between hands. Heavily exploited by `abc` which bets strong hands into a blind caller.

---

### `pair_only`

**Key format:** `{board}|{R1}|{R2}`

The player knows only whether they have a pair — no card ranks at all.

| Field | Values |
|-------|--------|
| `board` | `pair` / `no_pair` / `-` |
| `R1` | action history of Round 1 so far |
| `R2` | action history of Round 2 so far |

```json
"-||":        { "Bet": 0.39, "Check": 0.61 }
"pair|cc|":   { "Bet": 0.93, "Check": 0.07 }
"no_pair|cc|":{ "Bet": 0.18, "Check": 0.82 }
```

Round 1 is played blind (no public card yet, no pair possible). Round 2 shows the strongest signal pair_only can act on: a pair bets 93%, no pair mostly checks. Ranks are irrelevant — a J pair and a K pair play identically.

---

### `blind`

**Key format:** `{board}|{R1}|{R2}`

The player observes only the betting history and which round it is. No card information whatsoever.

| Field | Values |
|-------|--------|
| `board` | `pub` (Round 2) / `-` (Round 1) |
| `R1` | action history of Round 1 so far |
| `R2` | action history of Round 2 so far |

```json
"-||":    { "Bet": 0.39, "Check": 0.61 }
"-|b|":   { "Fold": 0.0, "Call": 0.0, "Raise": 1.0 }
"pub|cc|":{ "Bet": 0.50, "Check": 0.50 }
"pub|b|": { "Fold": 0.0, "Call": 0.0, "Raise": 1.0 }
```

Facing any bet (`-|b|`, `pub|b|`), the blind agent always raises — a pure bluff/aggression policy since it has no reason to fold or call without card information. Opening actions are mixed to be unexploitable by position alone. One of the weakest strategies overall but theoretically optimal for the information it has.

---

## What to look for across strategies

- **Same key, different strategies** — compare `"K|...|cc|"` in `exact` vs `pair` vs `card_only` to see how each piece of information changes the bet frequency
- **Probabilities near 1.0** — pure strategy, the solver is confident regardless of mixing
- **Mixed strategies (e.g. 50/50)** — genuine indifference; mixing is required to stay unexploitable
- **Round 1 is often identical** — before the public card, `exact`, `relative`, `pair`, and `card_only` all have the same information (private card only), so their Round 1 keys and probabilities match

## Regenerating strategies

Strategies are precomputed from the [holdemsolver](https://github.com/Raffinate/holdem_solver) repo at 100k CFR iterations:

```
make strategies   # run from holdemsolver/
```
