import { describe, expect, it } from "vitest"
import {
  type Action,
  type Card,
  contributions,
  infoStateKey,
  isOver,
  isRoundDone,
  legalActions,
  type Rng,
  showdownWinner,
  toAct,
  utility,
} from "./rules.ts"
import { canContinue, humanToAct, lastMove, legalFor, type Message, Session, type View } from "./session.ts"

/** Deterministic xorshift RNG in [0, 1). */
function seeded(seed: number): Rng {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 2 ** 32
  }
}

const J: Card = 0
const Q: Card = 1
const K: Card = 2

describe("rules", () => {
  it("ends betting rounds on the right sequences", () => {
    const done: Action[][] = [
      ["Check", "Check"],
      ["Bet", "Call"],
      ["Bet", "Fold"],
      ["Check", "Bet", "Call"],
      ["Bet", "Raise", "Call"],
      ["Check", "Bet", "Raise", "Fold"],
    ]
    for (const r of done) expect(isRoundDone(r)).toBe(true)
    for (const r of [[], ["Check"], ["Bet"], ["Check", "Bet"], ["Bet", "Raise"]] as Action[][]) expect(isRoundDone(r)).toBe(false)
  })

  it("allows one raise per round", () => {
    expect(legalActions([], [])).toEqual(["Check", "Bet"])
    expect(legalActions(["Bet"], [])).toEqual(["Fold", "Call", "Raise"])
    expect(legalActions(["Bet", "Raise"], [])).toEqual(["Fold", "Call"])
    expect(legalActions(["Check", "Check"], ["Check", "Bet"])).toEqual(["Fold", "Call", "Raise"])
  })

  it("asks for the board between rounds", () => {
    expect(toAct(["Check", "Check"], [], null)).toBe("chance")
    expect(toAct(["Check", "Check"], [], Q)).toBe(0)
    expect(toAct(["Bet", "Fold"], [], null)).toBeNull()
  })

  it("counts the pot with antes and round sizes", () => {
    expect(contributions(["Bet", "Raise", "Call"], ["Bet", "Call"])).toEqual([1 + 4 + 4, 1 + 4 + 4])
    expect(contributions(["Check", "Bet", "Raise", "Fold"], [])).toEqual([1 + 4, 1 + 2])
  })

  it("ranks a pair above high cards", () => {
    expect(showdownWinner([J, K], J)).toBe(0)
    expect(showdownWinner([Q, K], J)).toBe(1)
    expect(showdownWinner([Q, Q], K)).toBeNull()
  })

  it("is zero-sum", () => {
    const r1: Action[] = ["Bet", "Call"]
    const r2: Action[] = ["Check", "Bet", "Call"]
    expect(utility([K, Q], J, r1, r2, 0)).toBe(7)
    expect(utility([K, Q], J, r1, r2, 1)).toBe(-7)
    expect(utility([K, Q], J, ["Bet", "Fold"], [], 0)).toBe(1)
  })

  it("builds each strategy's key", () => {
    const h: Action[] = ["Check", "Check"]
    const r2: Action[] = ["Bet"]
    expect(infoStateKey("exact", K, J, h, r2)).toBe("K|J|cc|b")
    expect(infoStateKey("relative", J, K, h, r2)).toBe("J|higher|cc|b")
    expect(infoStateKey("relative", K, J, h, r2)).toBe("K|lower|cc|b")
    expect(infoStateKey("pair", K, K, h, r2)).toBe("K|pair|cc|b")
    expect(infoStateKey("card_only", K, J, h, r2)).toBe("K|pub|cc|b")
    expect(infoStateKey("board_only", K, J, h, r2)).toBe("-|J|cc|b")
    expect(infoStateKey("pair_only", K, J, h, r2)).toBe("no_pair|cc|b")
    expect(infoStateKey("blind", K, null, ["Bet", "Call"], [])).toBe("-|bca|")
  })
})

/** The human's turn: take the first legal action, or deal on. */
function step(s: Session, v: View) {
  if (canContinue(v)) return s.nextHand()
  if (humanToAct(v)) s.humanAct(legalFor(v)[v.deal % legalFor(v).length])
}

describe("solo session", () => {
  it("plays hands to completion with consistent stats", () => {
    let view!: View
    let net = 0
    const s = new Session({ onChange: (v) => (view = v), onEvent: (e) => (net += e.chips), rng: seeded(42) })
    s.startSolo({}, "exact")
    for (let i = 0; i < 5000 && view.stats.hands < 200; i++) step(s, view)
    expect(view.stats.hands).toBe(200)
    expect(view.stats.net).toBe(net)
    expect(view.history.reduce((a, h) => a + h.chips, 0)).toBe(net)
    for (const h of view.history) expect(isOver(h.r1, h.r2, h.pub)).toBe(true)
  })

  it("reveals a folded opponent's card only on request", () => {
    let view!: View
    const s = new Session({ onChange: (v) => (view = v), rng: seeded(3) })
    s.startSolo({}, "exact")
    for (let i = 0; i < 1000 && !(view.result && view.result.folder !== null); i++) {
      if (canContinue(view)) s.nextHand()
      else if (humanToAct(view)) s.humanAct(legalFor(view).includes("Fold") ? "Fold" : "Bet")
    }
    expect(view.oppCard).toBeNull()
    expect(view.canReveal).toBe(true)
    s.revealFolded()
    expect(view.oppCard).not.toBeNull()
    expect(view.history[0].revealed).toBe(true)
  })

  it("ignores an illegal action", () => {
    let view!: View
    const s = new Session({ onChange: (v) => (view = v), rng: seeded(9) })
    s.startSolo({}, "exact")
    while (!humanToAct(view)) step(s, view)
    const before = view.r1.length
    s.humanAct("Raise")
    if (!legalFor({ ...view, r1: view.r1.slice(0, before) }).includes("Raise")) expect(view.r1.length).toBe(before)
  })

  it("names the last move with its cost", () => {
    expect(lastMove(["Check", "Bet"], [])).toEqual({ seat: 1, action: "Bet", cost: 2 })
    expect(lastMove(["Check", "Check"], ["Bet", "Raise"])).toEqual({ seat: 1, action: "Raise", cost: 8 })
    expect(lastMove([], [])).toBeNull()
  })
})

describe("multiplayer session", () => {
  it("keeps host and guest in sync over many hands", () => {
    let hostView!: View
    let guestView!: View
    const toGuest: Message[] = []
    const toHost: Message[] = []
    const host = new Session({ onChange: (v) => (hostView = v), send: (m) => toGuest.push(m), rng: seeded(5) })
    const guest = new Session({ onChange: (v) => (guestView = v), send: (m) => toHost.push(m), rng: seeded(77) })
    const pump = () => {
      while (toGuest.length || toHost.length) {
        while (toGuest.length) guest.receive(JSON.parse(JSON.stringify(toGuest.shift())))
        while (toHost.length) host.receive(JSON.parse(JSON.stringify(toHost.shift())))
      }
    }
    guest.startGuest()
    host.startHost()
    pump()
    for (let i = 0; i < 3000 && hostView.stats.hands < 100; i++) {
      expect(guestView.human).toBe(1 - hostView.human)
      expect(guestView.r1).toEqual(hostView.r1)
      expect(guestView.r2).toEqual(hostView.r2)
      expect(guestView.pub).toEqual(hostView.pub)
      // The guest never sees the host's card before showdown.
      if (!guestView.result) expect(guestView.oppCard).toBeNull()
      if (hostView.result) {
        expect(guestView.result!.chips + hostView.result.chips).toBe(0)
        if (hostView.result.folder === null) expect(guestView.oppCard).toBe(hostView.card)
        host.nextHand()
      } else if (humanToAct(hostView)) step(host, hostView)
      else step(guest, guestView)
      pump()
    }
    expect(hostView.stats.hands).toBe(100)
    expect(guestView.stats.net + hostView.stats.net).toBe(0)
  })
})
