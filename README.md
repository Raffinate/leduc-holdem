# Leduc Hold'em — Play vs AI

A browser-based Leduc Hold'em game where you play against strategies trained with Counterfactual Regret Minimization (CFR). No installation required — static HTML/JS, no build step.

## Play

Serve the directory over HTTP and open `index.html`:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Strategies

Eleven AI strategies are available:

| Strategy | Type | What the AI observes |
|----------|------|----------------------|
| `exact` | CFR | Private card + exact public card |
| `relative` | CFR | Private card + higher/lower/pair |
| `pair` | CFR | Private card + pair/no_pair |
| `card_only` | CFR | Private card only (ignores board) |
| `board_only` | CFR | Public card only (ignores private) |
| `pair_only` | CFR | Pair/no_pair only (no card ranks) |
| `blind` | CFR | Betting history only (no cards) |
| `abc` | Heuristic | K or pair → bet/raise; J → check/fold; Q → check/call |
| `random` | Fixed | Uniform random (never folds when check is available) |
| `always_call` | Fixed | Always call/check |
| `always_raise` | Fixed | Always raise/bet |

## Reading the strategy files

Each `data/<strategy>.json` maps **info state keys** to **action probabilities**.

### Key format

**4-part key** (most strategies): `{private_card}|{board}|{R1_history}|{R2_history}`

**3-part key** (`pair_only`, `blind`): `{board}|{R1_history}|{R2_history}` — private card dropped entirely.

The board field encodes what the player knows about the public card:

| Strategy | Board field values |
|----------|--------------------|
| `exact` | `J` / `Q` / `K` / `-` |
| `relative` | `higher` / `lower` / `pair` / `-` |
| `pair` | `pair` / `no_pair` / `-` |
| `card_only` | `pub` / `-` |
| `board_only` | `J` / `Q` / `K` / `-` |
| `pair_only` | `pair` / `no_pair` / `-` |
| `blind` | `pub` / `-` |

`-` means no public card yet (Round 1). `pub` means a public card exists but its value is ignored.

### Action history tokens

| Token | Action |
|-------|--------|
| `c` | Check |
| `b` | Bet |
| `ca` | Call |
| `r` | Raise |
| `f` | Fold |

### Examples

```json
"K|-||":       { "Bet": 0.77, "Check": 0.23 }
```
King private, Round 1, no actions yet → bet 77%.

```json
"J|-|b|":      { "Fold": 0.96, "Call": 0.01, "Raise": 0.03 }
```
Jack private, facing a bet in Round 1 → fold 96%.

```json
"K|J|cc|":     { "Bet": 0.91, "Check": 0.09 }
```
King private, Jack public, both checked Round 1, Round 2 opening → bet 91%.

```json
"pub|cc|":     { "Bet": 0.50, "Check": 0.50 }
```
`blind` strategy, Round 2, both checked Round 1 → 50/50 with no card information.

### What to look for

- **Probabilities near 1.0** — pure strategy, solver is confident
- **Mixed strategies** — solver is genuinely indifferent, mixing to stay unexploitable
- **Same key across strategies** — compare e.g. `exact` vs `relative` at `K|...|cc|` to see how information loss changes play

## Regenerating strategies

Strategies are precomputed from the [holdemsolver](https://github.com/Raffinate/holdem_solver) repo at 100k CFR iterations:

```
make strategies   # run from holdemsolver/
```
