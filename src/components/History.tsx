import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/solid/collapsible"
import { For, Show } from "solid-js"
import { CARD_LABEL } from "../game/rules.ts"
import { type HistoryEntry, movesOf } from "../game/session.ts"
import { Panel, plural } from "./ui.tsx"

function Entry(props: { h: HistoryEntry }) {
  const h = () => props.h
  const line = (r: 0 | 1) =>
    movesOf(r === 0 ? h().r1 : h().r2, r)
      .map((m) => `${m.seat === h().human ? "You" : "Opp"} ${m.action.toLowerCase()}${m.cost ? ` ${m.cost}` : ""}`)
      .join(" → ")
  const outcome = () => (h().folder === null ? "showdown" : h().folder === h().human ? "you folded" : "opponent folded")
  return (
    <li class="grid grid-cols-[3rem_1fr] gap-x-3 border-t border-border py-2 text-sm first:border-t-0">
      <span class="text-muted-foreground tabular-nums">#{h().n}</span>
      <div>
        <span class={["font-medium tabular-nums", h().chips > 0 ? "text-win" : h().chips < 0 ? "text-loss" : ""]}>
          {h().chips > 0 ? "+" : ""}
          {h().chips}
        </span>{" "}
        <span class="text-muted-foreground">· {outcome()}</span>
        <div class="text-xs text-muted-foreground">
          You {CARD_LABEL[h().card]} · Board {h().pub !== null ? CARD_LABEL[h().pub!] : "–"} · Opponent{" "}
          {h().oppCard !== null ? CARD_LABEL[h().oppCard!] : "?"} · you acted {h().human === 0 ? "first" : "second"}
        </div>
        <div class="text-xs text-muted-foreground">R1: {line(0) || "–"}</div>
        <Show when={h().r2.length}>
          <div class="text-xs text-muted-foreground">R2: {line(1)}</div>
        </Show>
      </div>
    </li>
  )
}

export function History(props: { entries: readonly HistoryEntry[] }) {
  return (
    <Panel flush>
      <Collapsible>
        <CollapsibleTrigger
          class="group flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/40 sm:px-5"
          data-ph-capture-attribute-action="toggle-history"
        >
          <span>
            Hand history <span class="font-normal text-muted-foreground">({plural(props.entries.length, "hand")})</span>
          </span>
          <svg
            viewBox="0 0 24 24"
            class="size-4 opacity-60 transition-transform group-data-open:rotate-180"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </CollapsibleTrigger>
        <CollapsiblePanel class="px-4 pb-3 sm:px-5">
          <Show when={props.entries.length} fallback={<p class="text-sm text-muted-foreground">No hands yet.</p>}>
            <ol>
              <For each={props.entries}>{(h) => <Entry h={h} />}</For>
            </ol>
          </Show>
        </CollapsiblePanel>
      </Collapsible>
    </Panel>
  )
}
