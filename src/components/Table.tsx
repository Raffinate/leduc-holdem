import { Button } from "@ui-sdk/solid/button"
import { For, Match, Show, Switch, type Element as JSXElement } from "solid-js"
import { type Action, type Card, contributions, handLabel, isPair, other, type Seat } from "../game/rules.ts"
import { canContinue, costOf, humanToAct, lastMove, legalFor, type Move, movesOf, pot, roundOf, type View } from "../game/session.ts"
import { CardFace, CardSlot, OpponentCard } from "./PlayingCard.tsx"
import { buttonClass, Kbd } from "./ui.tsx"

export const HOTKEYS: Record<Action, string> = { Check: "Space", Bet: "B", Call: "C", Raise: "R", Fold: "F" }

const verb: Record<Action, string> = { Check: "checks", Bet: "bets", Call: "calls", Raise: "raises", Fold: "folds" }
const verbYou: Record<Action, string> = { Check: "check", Bet: "bet", Call: "call", Raise: "raise", Fold: "fold" }

function describe(m: Move, human: Seat, them: string) {
  const you = m.seat === human
  const text = `${you ? "You" : them} ${you ? verbYou[m.action] : verb[m.action]}`
  return m.cost ? `${text} ${m.cost}` : text
}

function Seat(props: { label: string; name?: string; first: boolean; inPot: number; turn: boolean; children: JSXElement }) {
  return (
    <div class="flex items-center gap-4">
      {props.children}
      <div class="min-w-0 space-y-1 text-sm">
        <div class="flex items-center gap-2">
          <span
            class={["size-2 rounded-full transition-colors", props.turn ? "bg-amber-300" : "bg-felt-foreground/25"]}
            aria-hidden="true"
          />
          <span class="font-semibold text-white">{props.label}</span>
          <Show when={props.name}>
            <span class="truncate text-felt-foreground/80">{props.name}</span>
          </Show>
          <Show when={props.turn}>
            <span class="sr-only">(to act)</span>
          </Show>
        </div>
        <div class="text-xs text-felt-foreground/75">
          {props.first ? "Acts first" : "Acts second"} · {props.inPot} in the pot
        </div>
      </div>
    </div>
  )
}

function BettingLog(props: { view: View; them: string }) {
  const rounds = () =>
    [
      { label: "Round 1", moves: movesOf(props.view.r1, 0) },
      { label: "Round 2", moves: movesOf(props.view.r2, 1) },
    ].filter((r) => r.moves.length)
  return (
    <div class="min-w-0 flex-1 space-y-2 text-xs">
      <Show when={rounds().length} fallback={<p class="text-felt-foreground/70">No bets yet.</p>}>
        <For each={rounds()}>
          {(r) => (
            <div>
              <div class="mb-1 font-medium tracking-wide text-felt-foreground/70 uppercase">{r.label}</div>
              <ol class="flex flex-wrap gap-1">
                <For each={r.moves}>
                  {(m) => (
                    <li
                      class={[
                        "rounded-full px-2 py-0.5",
                        m.seat === props.view.human ? "bg-white/15 text-white" : "bg-black/20 text-felt-foreground",
                      ]}
                    >
                      {describe(m, props.view.human, props.them)}
                    </li>
                  )}
                </For>
              </ol>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}

/** The felt: opponent at the top, board and pot in the middle, you at the bottom. */
export function Table(props: { view: View; opponentName: string; onReveal: () => void }) {
  const v = () => props.view
  const opp = () => other(v().human)
  const inPot = () => contributions(v().r1, v().r2)
  const turn = (seat: Seat) => humanToAct(v()) ? seat === v().human : !v().result && seat === opp() && v().card !== null
  const winner = () => {
    const r = v().result
    if (!r || r.chips === 0) return null
    return r.chips > 0 ? v().human : opp()
  }

  return (
    <div class="space-y-5 rounded-xl bg-felt p-4 text-felt-foreground shadow-inner sm:p-6">
      <Seat label="Opponent" name={props.opponentName} first={opp() === 0} inPot={inPot()[opp()]} turn={turn(opp())}>
        <OpponentCard card={v().oppCard} canReveal={v().canReveal} onReveal={props.onReveal} />
      </Seat>

      <div class="flex items-start gap-4 rounded-lg border border-dashed border-felt-foreground/25 p-3">
        <div class="flex flex-col items-center gap-1.5">
          <Show when={v().pub !== null} fallback={<CardSlot label="Board" />}>
            <CardFace card={v().pub as Card} suit="♥" />
          </Show>
          <span class="text-xs font-medium text-white tabular-nums">Pot {pot(v())}</span>
        </div>
        <BettingLog view={v()} them={props.opponentName} />
      </div>

      <Seat label="You" first={v().human === 0} inPot={inPot()[v().human]} turn={turn(v().human)}>
        <Show when={v().card !== null}>
          <CardFace card={v().card as Card} suit="♠" highlight={winner() === v().human && isPair(v().card as Card, v().pub)} />
        </Show>
      </Seat>
    </div>
  )
}

function resultText(v: View, them: string) {
  const r = v.result!
  if (r.folder !== null) return r.folder === v.human ? "You folded." : `${them} folded.`
  if (v.oppCard === null || v.card === null) return r.chips > 0 ? "You won at showdown." : r.chips < 0 ? "You lost at showdown." : "Split pot."
  const you = handLabel(v.card, v.pub)
  const theirs = handLabel(v.oppCard, v.pub)
  if (r.chips > 0) return `Your ${you} beats ${theirs}.`
  if (r.chips < 0) return `Your ${you} loses to ${theirs}.`
  return `${you} and ${theirs}: split pot.`
}

/** What just happened, whose move it is, and the buttons for it. */
export function ActionBar(props: { view: View; opponentName: string; onAct: (a: Action) => void; onNext: () => void }) {
  const v = () => props.view
  const them = () => (v().mode === "solo" ? props.opponentName : "Your friend")
  const move = () => {
    const m = lastMove(v().r1, v().r2)
    return m && m.seat !== v().human ? `${describe(m, v().human, them())}.` : null
  }
  const waiting = () => (v().mode !== "solo" && !v().result && !humanToAct(v()) ? `Waiting for ${them().toLowerCase()}…` : null)

  return (
    <div class="space-y-3" aria-live="polite">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Hand {v().stats.hands + (v().result ? 0 : 1)} · Round {roundOf(v()) + 1} · Bets are {roundOf(v()) ? 4 : 2}
        </span>
        <Show when={move()}>{(m) => <span class="font-medium text-foreground">{m()}</span>}</Show>
      </div>

      <Switch fallback={<p class="text-sm">{waiting() ?? "Your move."}</p>}>
        <Match when={v().result}>
          {(r) => (
            <div class="flex items-baseline gap-3">
              <span
                class={[
                  "text-2xl font-semibold tabular-nums",
                  r().chips > 0 ? "text-win" : r().chips < 0 ? "text-loss" : "text-muted-foreground",
                ]}
              >
                {r().chips > 0 ? "+" : ""}
                {r().chips}
              </span>
              <span class="text-sm text-muted-foreground">{resultText(v(), them())}</span>
            </div>
          )}
        </Match>
      </Switch>

      <div class="flex min-h-9 flex-wrap gap-2">
        <Switch>
          <Match when={v().result}>
            <Show when={canContinue(v())} fallback={<p class="self-center text-sm text-muted-foreground">Waiting for the host…</p>}>
              <Button class={buttonClass.primary} onClick={props.onNext} data-ph-capture-attribute-action="next-hand">
                Next hand <Kbd>Space</Kbd>
              </Button>
            </Show>
          </Match>
          <Match when={humanToAct(v())}>
            <For each={legalFor(v())}>
              {(a) => (
                <Button
                  class={a === "Fold" ? buttonClass.outline : a === "Check" || a === "Call" ? buttonClass.primary : buttonClass.outline}
                  onClick={() => props.onAct(a)}
                  data-ph-capture-attribute-action={a.toLowerCase()}
                >
                  {a}
                  <Show when={costOf(v(), a)}>
                    {(c) => <span class="tabular-nums opacity-70">{c()}</span>}
                  </Show>
                  <Kbd>{HOTKEYS[a]}</Kbd>
                </Button>
              )}
            </For>
          </Match>
        </Switch>
      </div>
    </div>
  )
}
