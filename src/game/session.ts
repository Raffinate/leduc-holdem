import {
  type Action,
  actionCost,
  BET_SIZE,
  type Card,
  chooseAction,
  coinFlip,
  contributions,
  dealPrivate,
  dealPublic,
  folder,
  infoStateKey,
  isRoundDone,
  type KeyScheme,
  legalActions,
  other,
  type Rng,
  type Seat,
  type StrategyTable,
  toAct,
  utility,
} from "./rules.ts"

/**
 * One hand of Leduc Hold'em at a time, against an AI table or a friend over WebRTC. Seats are drawn
 * at random every hand; seat 0 acts first in both rounds.
 *
 * Multiplayer: the host deals every card and owns the authoritative state. The guest only ever learns
 * its own card, plus the opponent's at showdown.
 */

export type Mode = "solo" | "mp-host" | "mp-guest"

export interface HandResult {
  /** Net chips for the human. */
  chips: number
  folder: Seat | null
  /** The opponent's card, when the hand reached showdown. */
  oppCard: Card | null
}

export interface HistoryEntry extends HandResult {
  n: number
  human: Seat
  card: Card
  pub: Card | null
  r1: Action[]
  r2: Action[]
  /** Solo only: the human chose to see the opponent's card after a fold. */
  revealed: boolean
}

export interface Stats {
  hands: number
  net: number
}

export interface Move {
  seat: Seat
  action: Action
  /** Chips the action put in. */
  cost: number
}

export interface View {
  mode: Mode
  playing: boolean
  human: Seat
  /** The human's card, null before the deal. */
  card: Card | null
  /** The opponent's card once it's public: at showdown, or revealed after a fold in solo play. */
  oppCard: Card | null
  pub: Card | null
  r1: readonly Action[]
  r2: readonly Action[]
  /** Increments every deal, so per-hand UI state can tell hands apart. */
  deal: number
  result: HandResult | null
  /** Solo: a folded hand whose opponent card can still be shown. */
  canReveal: boolean
  stats: Stats
  history: readonly HistoryEntry[]
}

export type Message =
  | { type: "start"; guestSeat: Seat; yourCard: Card }
  | { type: "state"; pubCard: Card | null; r1: Action[]; r2: Action[] }
  | { type: "result"; chips: number; oppCard: Card | null; pubCard: Card | null; r1: Action[]; r2: Action[] }
  | { type: "action"; action: Action }
  | { type: "new_session" }

export type SessionEvent = { type: "hand_end"; chips: number; showdown: boolean }

export const pot = (v: View) => {
  const c = contributions(v.r1, v.r2)
  return c[0] + c[1]
}

export const roundOf = (v: View) => (isRoundDone(v.r1) && v.pub !== null ? 1 : 0)

export const humanToAct = (v: View) => v.playing && v.card !== null && !v.result && toAct(v.r1, v.r2, v.pub) === v.human

export const legalFor = (v: View) => (humanToAct(v) ? legalActions(v.r1, v.r2) : [])

/** What `action` would cost the human right now. */
export const costOf = (v: View, action: Action) => {
  const r = roundOf(v)
  return actionCost(r === 0 ? v.r1 : v.r2, BET_SIZE[r], action)
}

/** The latest action in the hand, with who made it and what it cost. */
export function lastMove(r1: readonly Action[], r2: readonly Action[]): Move | null {
  const [round, r] = r2.length ? [r2, 1] : [r1, 0]
  if (!round.length) return null
  const i = round.length - 1
  return { seat: (i % 2) as Seat, action: round[i], cost: actionCost(round.slice(0, i), BET_SIZE[r], round[i]) }
}

/** Every action of one round with its seat and cost, for the betting log. */
export function movesOf(round: readonly Action[], r: 0 | 1): Move[] {
  return round.map((action, i) => ({ seat: (i % 2) as Seat, action, cost: actionCost(round.slice(0, i), BET_SIZE[r], action) }))
}

export const canContinue = (v: View) => v.result !== null && v.mode !== "mp-guest"

export interface SessionOptions {
  onChange: (view: View) => void
  onEvent?: (event: SessionEvent) => void
  send?: (msg: Message) => void
  rng?: Rng
}

export class Session {
  private mode: Mode = "solo"
  private playing = false
  private table: StrategyTable | null = null
  private scheme: KeyScheme = "exact"
  private cards: [Card | null, Card | null] = [null, null]
  private pub: Card | null = null
  private r1: Action[] = []
  private r2: Action[] = []
  private human: Seat = 0
  private guestSeat: Seat = 1
  private deal = 0
  private result: HandResult | null = null
  private revealed = false
  private stats: Stats = { hands: 0, net: 0 }
  private history: HistoryEntry[] = []
  private readonly rng: Rng

  constructor(private readonly opts: SessionOptions) {
    this.rng = opts.rng ?? Math.random
  }

  view(): View {
    const opp = this.cards[other(this.human)]
    const showOpp = this.result !== null && (this.result.oppCard !== null || this.revealed)
    return {
      mode: this.mode,
      playing: this.playing,
      human: this.human,
      card: this.cards[this.human],
      oppCard: showOpp ? (this.result!.oppCard ?? opp) : null,
      pub: this.pub,
      r1: [...this.r1],
      r2: [...this.r2],
      deal: this.deal,
      result: this.result && { ...this.result },
      canReveal: this.mode === "solo" && this.result !== null && this.result.folder !== null && !this.revealed,
      stats: { ...this.stats },
      history: this.history.map((h) => ({ ...h })),
    }
  }

  private changed() {
    this.opts.onChange(this.view())
  }

  private send(msg: Message) {
    this.opts.send?.(msg)
  }

  private sendState() {
    this.send({ type: "state", pubCard: this.pub, r1: [...this.r1], r2: [...this.r2] })
  }

  startSolo(table: StrategyTable, scheme: KeyScheme) {
    this.reset("solo")
    this.table = table
    this.scheme = scheme
    this.newHand()
  }

  startHost() {
    this.reset("mp-host")
    this.newHand()
  }

  startGuest() {
    this.reset("mp-guest")
    this.changed()
  }

  stop() {
    this.reset("solo")
    this.playing = false
    this.changed()
  }

  newSession() {
    if (this.mode === "mp-guest") return
    this.stats = { hands: 0, net: 0 }
    this.history = []
    if (this.mode === "mp-host") this.send({ type: "new_session" })
    this.newHand()
  }

  private reset(mode: Mode) {
    this.mode = mode
    this.playing = true
    this.table = null
    this.cards = [null, null]
    this.pub = null
    this.r1 = []
    this.r2 = []
    this.result = null
    this.revealed = false
    this.stats = { hands: 0, net: 0 }
    this.history = []
  }

  private clearHand() {
    this.deal++
    this.pub = null
    this.r1 = []
    this.r2 = []
    this.result = null
    this.revealed = false
  }

  /** Deal the next hand. The guest waits for the host's. */
  nextHand() {
    if (this.mode === "mp-guest" || !this.result) return
    this.newHand()
  }

  private newHand() {
    this.clearHand()
    this.cards = dealPrivate(this.rng)
    if (this.mode === "mp-host") {
      this.guestSeat = coinFlip(this.rng)
      this.human = other(this.guestSeat)
      this.send({ type: "start", guestSeat: this.guestSeat, yourCard: this.cards[this.guestSeat]! })
      this.sendState()
    } else {
      this.human = coinFlip(this.rng)
    }
    this.advance()
  }

  /** Deal the board when it's due and let the AI move, until the human acts or the hand ends. */
  private advance() {
    for (;;) {
      const p = toAct(this.r1, this.r2, this.pub)
      if (p === null) return this.finish()
      if (p === "chance") {
        this.pub = dealPublic(this.cards as [Card, Card], this.rng)
        if (this.mode === "mp-host") this.sendState()
        continue
      }
      if (p === this.human || this.mode !== "solo") break // multiplayer: wait for the remote action
      const key = infoStateKey(this.scheme, this.cards[p]!, this.pub, this.r1, this.r2)
      this.apply(chooseAction(this.table, key, legalActions(this.r1, this.r2), this.rng))
    }
    this.changed()
  }

  private apply(action: Action) {
    if (!isRoundDone(this.r1)) this.r1.push(action)
    else this.r2.push(action)
  }

  humanAct(action: Action) {
    const v = this.view()
    if (!humanToAct(v) || !legalActions(this.r1, this.r2).includes(action)) return
    this.apply(action)
    if (this.mode === "mp-guest") {
      // Shown right away; the host's next state confirms it.
      this.send({ type: "action", action })
      this.changed()
      return
    }
    if (this.mode === "mp-host") this.sendState()
    this.advance()
  }

  /** Host/solo: score the hand. Only reached with both cards known. */
  private finish() {
    const cards = this.cards as [Card, Card]
    const f = folder(this.r1, this.r2)
    const oppCard = f === null ? cards[other(this.human)] : null
    this.record({ chips: utility(cards, this.pub, this.r1, this.r2, this.human), folder: f, oppCard })
    if (this.mode === "mp-host") {
      this.send({
        type: "result",
        chips: utility(cards, this.pub, this.r1, this.r2, this.guestSeat),
        oppCard: f === null ? cards[this.human] : null,
        pubCard: this.pub,
        r1: [...this.r1],
        r2: [...this.r2],
      })
    }
    this.changed()
  }

  private record(result: HandResult) {
    this.result = result
    this.stats.hands++
    this.stats.net += result.chips
    this.history.unshift({
      ...result,
      n: this.stats.hands,
      human: this.human,
      card: this.cards[this.human]!,
      pub: this.pub,
      r1: [...this.r1],
      r2: [...this.r2],
      revealed: false,
    })
    this.opts.onEvent?.({ type: "hand_end", chips: result.chips, showdown: result.folder === null })
  }

  /** Solo: turn over the opponent's card after a fold. */
  revealFolded() {
    if (!this.view().canReveal) return
    this.revealed = true
    if (this.history[0]) {
      this.history[0].revealed = true
      this.history[0].oppCard = this.cards[other(this.human)]
    }
    this.changed()
  }

  receive(msg: Message) {
    if (!this.playing) return
    switch (msg.type) {
      // Guest side.
      case "start":
        this.clearHand()
        this.human = msg.guestSeat
        this.cards = [null, null]
        this.cards[this.human] = msg.yourCard
        break
      case "state":
        this.pub = msg.pubCard
        this.r1 = [...msg.r1]
        this.r2 = [...msg.r2]
        break
      case "result":
        this.pub = msg.pubCard
        this.r1 = [...msg.r1]
        this.r2 = [...msg.r2]
        if (msg.oppCard !== null) this.cards[other(this.human)] = msg.oppCard
        this.record({ chips: msg.chips, folder: folder(this.r1, this.r2), oppCard: msg.oppCard })
        break
      case "new_session":
        this.stats = { hands: 0, net: 0 }
        this.history = []
        break
      // Host side.
      case "action":
        if (this.mode !== "mp-host" || this.result) return
        if (toAct(this.r1, this.r2, this.pub) !== this.guestSeat || !legalActions(this.r1, this.r2).includes(msg.action)) return
        this.apply(msg.action)
        this.sendState()
        this.advance()
        return
    }
    this.changed()
  }
}
