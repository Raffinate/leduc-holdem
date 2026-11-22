import { Show } from "solid-js"
import { type Card, CARD_LABEL } from "../game/rules.ts"

/** Each player's card gets its own suit, so the board reads apart from the hands at a glance. */
export type Suit = "♠" | "♣" | "♥"

const size = "h-24 w-[4.25rem] shrink-0 rounded-lg sm:h-28 sm:w-20"
const rankName = ["Jack", "Queen", "King"]
const suitName: Record<Suit, string> = { "♠": "spades", "♣": "clubs", "♥": "hearts" }

export function CardFace(props: { card: Card; suit: Suit; highlight?: boolean }) {
  const label = () => CARD_LABEL[props.card]
  return (
    <div
      role="img"
      aria-label={`${rankName[props.card]} of ${suitName[props.suit]}`}
      class={[
        size,
        "relative flex flex-col items-center justify-center border border-neutral-300 bg-white font-card shadow-sm",
        props.suit === "♥" ? "text-suit-red" : "text-suit-black",
        props.highlight && "ring-3 ring-amber-300",
      ]}
    >
      <span class="absolute top-1.5 left-2 text-sm leading-none font-bold">
        {label()}
        <span class="block text-xs">{props.suit}</span>
      </span>
      <span class="text-4xl leading-none font-bold sm:text-5xl">{label()}</span>
      <span class="mt-1 text-lg leading-none">{props.suit}</span>
    </div>
  )
}

export function CardBack() {
  return <div class={[size, "card-back border border-white/20 shadow-sm"]} role="img" aria-label="Face-down card" />
}

/** An empty spot on the felt, before the board is dealt. */
export function CardSlot(props: { label: string }) {
  return (
    <div
      class={[size, "flex items-center justify-center border-2 border-dashed border-felt-foreground/30 text-xs text-felt-foreground/60"]}
    >
      {props.label}
    </div>
  )
}

/** The opponent's card: face up once it's public, otherwise a back, clickable to show it when allowed. */
export function OpponentCard(props: { card: Card | null; canReveal: boolean; onReveal: () => void }) {
  return (
    <Show
      when={props.card !== null}
      fallback={
        <Show when={props.canReveal} fallback={<CardBack />}>
          <button
            type="button"
            onClick={props.onReveal}
            data-ph-capture-attribute-action="reveal-folded"
            class="group relative rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
            aria-label="Show the opponent's card"
          >
            <CardBack />
            <span class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 text-xs font-medium text-white opacity-90 group-hover:opacity-100">
              Show
            </span>
          </button>
        </Show>
      }
    >
      <CardFace card={props.card!} suit="♣" />
    </Show>
  )
}
