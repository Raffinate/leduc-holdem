import type { KeyScheme, StrategyTable } from "./rules.ts"

export interface Opponent {
  /** File name in public/data/, as exported by holdemsolver. */
  id: string
  name: string
  blurb: string
  /** Which info-state key its table is indexed by. */
  scheme: KeyScheme
  group: "solved" | "fixed"
}

/**
 * CFR strategies, one per information abstraction, from most to least informed; then rule-based ones.
 * All ship as lookup tables.
 */
export const opponents: Opponent[] = [
  { id: "exact", name: "The Computer", blurb: "Perfect GTO player.", scheme: "exact", group: "solved" },
  { id: "relative", name: "The Pro", blurb: "Near-perfect GTO player.", scheme: "relative", group: "solved" },
  { id: "pair", name: "The Regular", blurb: "Solid grasp of the game's core concepts.", scheme: "pair", group: "solved" },
  { id: "card_only", name: "The Sticky", blurb: "Committed to their cards and won't adjust.", scheme: "card_only", group: "solved" },
  { id: "board_only", name: "The Reader", blurb: "Plays the opponent, not the cards.", scheme: "board_only", group: "solved" },
  { id: "pair_only", name: "The Recreational", blurb: "Only gets serious when something clicks.", scheme: "pair_only", group: "solved" },
  { id: "blind", name: "The Philosopher", blurb: "Reality is just a construct.", scheme: "blind", group: "solved" },
  { id: "abc", name: "ABC", blurb: "Plays it as straight as it gets.", scheme: "pair", group: "fixed" },
  { id: "always_call", name: "Always Call", blurb: "Never folds, never bets. Just calls.", scheme: "blind", group: "fixed" },
  { id: "always_raise", name: "Always Raise", blurb: "Bets and raises every chance they get.", scheme: "blind", group: "fixed" },
  { id: "random", name: "Random", blurb: "Acts randomly on every decision.", scheme: "blind", group: "fixed" },
]

/** Select value for playing a friend over WebRTC instead of an AI. */
export const FRIEND = "human"

export const findOpponent = (id: string) => opponents.find((o) => o.id === id)

const cache = new Map<string, Promise<StrategyTable>>()

/** Fetch a strategy table once per page. The exporter wraps it under "strategy", beside "meta" and "state". */
export function loadStrategy(id: string): Promise<StrategyTable> {
  let p = cache.get(id)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ strategy: StrategyTable }>
      })
      .then((data) => data.strategy)
    p.catch(() => cache.delete(id))
    cache.set(id, p)
  }
  return p
}
