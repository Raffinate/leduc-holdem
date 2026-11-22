/**
 * Leduc Hold'em rules, matching the holdemsolver game model.
 *
 * 6 cards: J, Q, K, two of each. Both players ante 1 and get one private card. Round 1 bets are 2,
 * then a public card, then round 2 bets are 4. At most one raise per round. Seat 0 acts first in both
 * rounds. At showdown a pair (private card matches the board) beats any unpaired hand; otherwise the
 * higher card wins and equal cards split.
 */

export type Seat = 0 | 1
export type Card = 0 | 1 | 2
export type Rng = () => number
export type Action = "Check" | "Bet" | "Call" | "Raise" | "Fold"

/** A strategy table: info-state key → action → probability. */
export type StrategyTable = Record<string, Partial<Record<Action, number>>>

export const CARD_LABEL = ["J", "Q", "K"] as const
export const ANTE = 1
export const BET_SIZE = [2, 4] as const

export const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0)
export const coinFlip = (rng: Rng): Seat => (rng() < 0.5 ? 0 : 1)

const last = <T>(a: readonly T[]) => a[a.length - 1]

export function isRoundDone(r: readonly Action[]) {
  const n = r.length
  if (n < 2) return false
  if (last(r) === "Fold") return true
  if (n === 2) return (r[0] === "Check" && r[1] === "Check") || (r[0] === "Bet" && r[1] === "Call")
  if (n === 3)
    return (r[0] === "Check" && r[1] === "Bet" && r[2] === "Call") || (r[0] === "Bet" && r[1] === "Raise" && r[2] === "Call")
  if (n === 4) return r[0] === "Check" && r[1] === "Bet" && r[2] === "Raise" && (r[3] === "Call" || r[3] === "Fold")
  return false
}

/** 0 for round 1, 1 for round 2: round 2 starts once round 1 is done and the board is out. */
export const roundIndex = (r1: readonly Action[], pub: Card | null) => (isRoundDone(r1) && pub !== null ? 1 : 0)

export function legalActions(r1: readonly Action[], r2: readonly Action[]): Action[] {
  const round = isRoundDone(r1) ? r2 : r1
  if (!round.some((a) => a === "Bet" || a === "Raise")) return ["Check", "Bet"]
  if (!round.includes("Raise")) return ["Fold", "Call", "Raise"]
  return ["Fold", "Call"]
}

/** The seat whose turn it is, "chance" when the board is due, or null when the hand is over. */
export function toAct(r1: readonly Action[], r2: readonly Action[], pub: Card | null): Seat | "chance" | null {
  if (isOver(r1, r2, pub)) return null
  if (!isRoundDone(r1)) return (r1.length % 2) as Seat
  if (pub === null) return "chance"
  return (r2.length % 2) as Seat
}

/** Who folded, if anyone. The folder is the seat that made the round's last action. */
export function folder(r1: readonly Action[], r2: readonly Action[]): Seat | null {
  if (last(r1) === "Fold") return ((r1.length - 1) % 2) as Seat
  if (last(r2) === "Fold") return ((r2.length - 1) % 2) as Seat
  return null
}

export function isOver(r1: readonly Action[], r2: readonly Action[], pub: Card | null) {
  if (folder(r1, r2) !== null) return true
  return isRoundDone(r1) && pub !== null && isRoundDone(r2)
}

function sampleWeighted<T>(items: T[], weight: (item: T) => number, rng: Rng): T {
  let r = rng()
  for (const item of items) {
    r -= weight(item)
    if (r <= 0) return item
  }
  return items[items.length - 1]
}

export function dealPrivate(rng: Rng): [Card, Card] {
  const outcomes: { c: [Card, Card]; p: number }[] = []
  for (const c0 of [0, 1, 2] as Card[])
    for (const c1 of [0, 1, 2] as Card[]) outcomes.push({ c: [c0, c1], p: c0 === c1 ? 2 / 30 : 4 / 30 })
  return sampleWeighted(outcomes, (o) => o.p, rng).c
}

export function dealPublic(cards: readonly [Card, Card], rng: Rng): Card {
  const counts = [2, 2, 2]
  counts[cards[0]]--
  counts[cards[1]]--
  const total = counts[0] + counts[1] + counts[2]
  const outcomes = ([0, 1, 2] as Card[]).filter((c) => counts[c] > 0).map((card) => ({ card, p: counts[card] / total }))
  return sampleWeighted(outcomes, (o) => o.p, rng).card
}

/** Chips each seat has put into one round. */
export function roundCommitted(actions: readonly Action[], bet: number): [number, number] {
  const committed: [number, number] = [0, 0]
  actions.forEach((a, i) => {
    const p = i % 2
    if (a === "Bet") committed[p] += bet
    if (a === "Call") committed[p] = committed[1 - p]
    if (a === "Raise") committed[p] = committed[1 - p] + bet
  })
  return committed
}

/** Chips each seat has put in so far, antes included. */
export function contributions(r1: readonly Action[], r2: readonly Action[]): [number, number] {
  const a = roundCommitted(r1, BET_SIZE[0])
  const b = roundCommitted(r2, BET_SIZE[1])
  return [ANTE + a[0] + b[0], ANTE + a[1] + b[1]]
}

/** What `action` costs the next player to act in this round. */
export function actionCost(round: readonly Action[], bet: number, action: Action) {
  const committed = roundCommitted(round, bet)
  const me = round.length % 2
  if (action === "Bet") return bet
  if (action === "Call") return committed[1 - me] - committed[me]
  if (action === "Raise") return committed[1 - me] + bet - committed[me]
  return 0
}

export const isPair = (card: Card, pub: Card | null) => pub !== null && card === pub

/** The showdown winner, or null for a split. */
export function showdownWinner(cards: readonly [Card, Card], pub: Card): Seat | null {
  const p0 = isPair(cards[0], pub)
  const p1 = isPair(cards[1], pub)
  if (p0 !== p1) return p0 ? 0 : 1
  if (cards[0] !== cards[1]) return cards[0] > cards[1] ? 0 : 1
  return null
}

/** Net chips for `player` in a finished hand. */
export function utility(cards: readonly [Card, Card], pub: Card | null, r1: readonly Action[], r2: readonly Action[], player: Seat) {
  const contrib = contributions(r1, r2)
  const f = folder(r1, r2)
  const winner = f !== null ? other(f) : showdownWinner(cards, pub!)
  if (winner === null) return 0
  return winner === player ? contrib[other(player)] : -contrib[player]
}

/**
 * What a strategy observes. Every strategy plays the same game; they differ only in how much of the
 * cards their info-state key keeps. Must exactly match the solver's info_state_key for each.
 */
export type KeyScheme = "exact" | "relative" | "pair" | "card_only" | "board_only" | "pair_only" | "blind"

const historyTokens: Record<Action, string> = { Check: "c", Bet: "b", Call: "ca", Raise: "r", Fold: "f" }

export function infoStateKey(scheme: KeyScheme, card: Card, pub: Card | null, r1: readonly Action[], r2: readonly Action[]) {
  const h1 = r1.map((a) => historyTokens[a]).join("")
  const h2 = r2.map((a) => historyTokens[a]).join("")
  const c = CARD_LABEL[card]
  const p = pub === null ? "-" : CARD_LABEL[pub]
  const pair = pub === null ? "-" : card === pub ? "pair" : "no_pair"
  const seen = pub === null ? "-" : "pub"
  switch (scheme) {
    case "exact":
      return `${c}|${p}|${h1}|${h2}`
    case "relative": {
      const d = pub === null ? "-" : card === pub ? "pair" : card < pub ? "higher" : "lower"
      return `${c}|${d}|${h1}|${h2}`
    }
    case "pair":
      return `${c}|${pair}|${h1}|${h2}`
    case "card_only":
      return `${c}|${seen}|${h1}|${h2}`
    case "board_only":
      return `-|${p}|${h1}|${h2}`
    case "pair_only":
      return `${pair}|${h1}|${h2}`
    case "blind":
      return `${seen}|${h1}|${h2}`
  }
}

/** Sample from the table's distribution; a missing key falls back to a uniformly random legal action. */
export function chooseAction(table: StrategyTable | null, key: string, actions: Action[], rng: Rng): Action {
  const entry = table?.[key]
  if (entry) {
    let r = rng()
    for (const a of actions) {
      r -= entry[a] ?? 0
      if (r <= 0) return a
    }
  }
  return actions[Math.floor(rng() * actions.length)]
}

/** "K", or "KK" for a pair with the board. */
export const handLabel = (card: Card, pub: Card | null) => (isPair(card, pub) ? CARD_LABEL[card].repeat(2) : CARD_LABEL[card])
