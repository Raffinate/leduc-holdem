import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/solid/dialog"
import { For, type Element as JSXElement } from "solid-js"
import { opponents } from "../game/strategies.ts"

function H(props: { children: JSXElement }) {
  return <h3 class="mt-5 mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:mt-0">{props.children}</h3>
}

function Rows(props: { rows: [string, string][] }) {
  return (
    <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
      <For each={props.rows}>
        {([k, v]) => (
          <>
            <dt class="font-medium">{k}</dt>
            <dd class="text-muted-foreground">{v}</dd>
          </>
        )}
      </For>
    </dl>
  )
}

export function HelpDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogBackdrop class="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent
        initialFocus="content"
        class="fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100%-2rem))] flex-col rounded-xl border border-border bg-card text-foreground shadow-xl outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-97 data-ending-style:opacity-0 data-starting-style:scale-97 data-starting-style:opacity-0 motion-reduce:transition-none"
      >
        <div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <DialogTitle class="text-base font-semibold">How to play</DialogTitle>
            <DialogDescription class="mt-0.5 text-sm text-muted-foreground">
              Two-player poker with a six-card deck and two short betting rounds.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Close"
            class="-mr-1 rounded-md p-1 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </DialogClose>
        </div>
        <div class="overflow-y-auto px-5 py-4 text-sm leading-relaxed">
          <H>What is Leduc Hold'em?</H>
          <p>
            A simplified poker game made for studying game theory. The deck is tiny and there are only two short betting
            rounds, so it's small enough to learn GTO play by hand, yet it still has the core of poker: pot odds, bluffs,
            ranges, and how often to check, bet and call.
          </p>

          <H>The deck</H>
          <p>6 cards: two each of Jack, Queen and King. K beats Q, Q beats J.</p>

          <H>A hand</H>
          <ol class="list-decimal space-y-1 pl-5">
            <li>Both players put 1 chip in the pot.</li>
            <li>Each gets one private card, face down.</li>
            <li>
              <strong>Round 1</strong>: bets are 2, a raise makes it 4.
            </li>
            <li>One public card is dealt face up: the board.</li>
            <li>
              <strong>Round 2</strong>: bets are 4, a raise makes it 8.
            </li>
            <li>If nobody folded, it's a showdown.</li>
          </ol>
          <p class="mt-2 text-muted-foreground">Who acts first is drawn at random each hand, and stays the same in both rounds.</p>

          <H>Showdown</H>
          <p>
            A <strong>pair</strong> (your card matches the board) beats any unpaired hand. Otherwise the higher card wins:
            K &gt; Q &gt; J. Equal cards split the pot.
          </p>

          <H>Betting</H>
          <p>
            With no bet in front of you, check or bet. Facing a bet, call it, raise, or fold. Only one raise is allowed per
            round, so facing a raise you can only call or fold. A fold ends the hand; otherwise play moves to the next
            round or the showdown.
          </p>

          <H>Actions and keys</H>
          <Rows
            rows={[
              ["Check · Space", "Pass without betting, when no bet is open."],
              ["Bet · B", "Open the betting for this round."],
              ["Call · C", "Match the opponent's bet to stay in."],
              ["Raise · R", "Raise by the round's bet size. One per round."],
              ["Fold · F", "Give up the hand and the chips you've put in."],
              ["Space", "Deal the next hand, once one is over."],
            ]}
          />

          <H>Opponents</H>
          <Rows rows={opponents.map((o) => [o.name, o.blurb])} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
