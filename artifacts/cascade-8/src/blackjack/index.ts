import "./blackjack.css";
import {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  BLACKJACK_TABLE_SEAT_NUMBERS,
  renderBlackjackTableShell,
  type BlackjackTableViewModel,
} from "./tableView";

export const BLACKJACK_ROUTE = "/blackjack";
export const BLACKJACK_MAX_SEATS = 5;

export const BLACKJACK_SHELL_MARKUP = renderBlackjackTableShell(
  BLACKJACK_DEFAULT_TABLE_VIEW,
);

export function mountBlackjack(
  app: HTMLElement,
  model: BlackjackTableViewModel = BLACKJACK_DEFAULT_TABLE_VIEW,
) {
  app.innerHTML = renderBlackjackTableShell(model);
}

export {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  BLACKJACK_TABLE_SEAT_NUMBERS,
  renderBlackjackTableShell,
};
export type { BlackjackTableViewModel };
