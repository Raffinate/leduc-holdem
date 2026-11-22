import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { type Action, type Card, infoStateKey, isRoundDone, legalActions, type StrategyTable } from "./rules.ts"
import { opponents } from "./strategies.ts"

// If the export format or a key scheme drifts, every lookup misses and the AI silently plays uniformly
// at random. These checks catch that.
describe.each(opponents.map((o) => [o.id, o] as const))("data/%s.json", (id, { scheme }) => {
  const { strategy } = JSON.parse(readFileSync(new URL(`../../public/data/${id}.json`, import.meta.url), "utf8")) as {
    strategy: StrategyTable
  }
  const cards: Card[] = [0, 1, 2]
  const spots: [Action[], Action[]][] = [
    [[], []],
    [["Bet"], []],
    [["Check", "Bet"], []],
    [["Check", "Check"], []],
    [["Bet", "Call"], ["Bet"]],
  ]

  it("has an entry for every reachable spot the client looks up", () => {
    for (const card of cards)
      for (const [r1, r2] of spots) {
        const pubs: (Card | null)[] = isRoundDone(r1) ? cards : [null]
        for (const pub of pubs) {
          const key = infoStateKey(scheme, card, pub, r1, r2)
          expect(strategy[key], key).toBeDefined()
        }
      }
  })

  it("only uses legal actions", () => {
    for (const [key, entry] of Object.entries(strategy)) {
      const [r1, r2] = historyOf(key)
      const legal = legalActions(r1, r2)
      for (const [a, p] of Object.entries(entry)) if (p! > 0) expect(legal, `${key} ${a}`).toContain(a)
    }
  })
})

const tokens: [string, Action][] = [
  ["ca", "Call"],
  ["c", "Check"],
  ["b", "Bet"],
  ["r", "Raise"],
  ["f", "Fold"],
]

function parse(s: string): Action[] {
  const out: Action[] = []
  for (let i = 0; i < s.length; ) {
    const [t, a] = tokens.find(([t]) => s.startsWith(t, i))!
    out.push(a)
    i += t.length
  }
  return out
}

/** Every scheme ends its key with the two round histories. */
function historyOf(key: string): [Action[], Action[]] {
  const parts = key.split("|")
  return [parse(parts[parts.length - 2]), parse(parts[parts.length - 1])]
}
