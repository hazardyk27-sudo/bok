import {
  RED_NUMBERS,
} from "./config";
import {
  type RouletteBetPlacement,
} from "./betState";

export type RouletteBetKind =
  | "straight"
  | "column"
  | "dozen"
  | "outside";

export type RouletteBetRule = {
  id: string;
  kind: RouletteBetKind;
  profitOdds: 35 | 2 | 1;
  covers: (winningNumber: number) => boolean;
};

export type RouletteBetSettlementLine = {
  betId: string;
  amount: number;
  won: boolean;
  profitOdds: number;
  grossReturn: number;
  netProfit: number;
};

export type RouletteRoundSettlement = {
  winningNumber: number;
  totalStake: number;
  winningStake: number;
  grossReturn: number;
  netProfit: number;
  winningBetIds: string[];
  lines: RouletteBetSettlementLine[];
};

function isValidRouletteNumber(
  value: number,
) {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 36
  );
}

function createStraightRule(
  number: number,
): RouletteBetRule | null {
  if (!isValidRouletteNumber(number)) {
    return null;
  }

  return {
    id: `straight-${number}`,
    kind: "straight",
    profitOdds: 35,
    covers: (winningNumber) =>
      winningNumber === number,
  };
}

function createColumnRule(
  column: number,
): RouletteBetRule | null {
  if (
    column < 1 ||
    column > 3 ||
    !Number.isInteger(column)
  ) {
    return null;
  }

  return {
    id: `column-${column}`,
    kind: "column",
    profitOdds: 2,
    covers: (winningNumber) =>
      winningNumber !== 0 &&
      (
        (
          (winningNumber - 1) %
          3
        ) +
        1
      ) === column,
  };
}

function createDozenRule(
  dozen: number,
): RouletteBetRule | null {
  if (
    dozen < 1 ||
    dozen > 3 ||
    !Number.isInteger(dozen)
  ) {
    return null;
  }

  const min =
    (dozen - 1) * 12 + 1;
  const max =
    dozen * 12;

  return {
    id: `dozen-${dozen}`,
    kind: "dozen",
    profitOdds: 2,
    covers: (winningNumber) =>
      winningNumber >= min &&
      winningNumber <= max,
  };
}

const OUTSIDE_RULES: Record<
  string,
  RouletteBetRule
> = {
  low: {
    id: "low",
    kind: "outside",
    profitOdds: 1,
    covers: (winningNumber) =>
      winningNumber >= 1 &&
      winningNumber <= 18,
  },
  high: {
    id: "high",
    kind: "outside",
    profitOdds: 1,
    covers: (winningNumber) =>
      winningNumber >= 19 &&
      winningNumber <= 36,
  },
  even: {
    id: "even",
    kind: "outside",
    profitOdds: 1,
    covers: (winningNumber) =>
      winningNumber !== 0 &&
      winningNumber % 2 === 0,
  },
  odd: {
    id: "odd",
    kind: "outside",
    profitOdds: 1,
    covers: (winningNumber) =>
      winningNumber !== 0 &&
      winningNumber % 2 === 1,
  },
  red: {
    id: "red",
    kind: "outside",
    profitOdds: 1,
    covers: (winningNumber) =>
      RED_NUMBERS.has(
        winningNumber,
      ),
  },
  black: {
    id: "black",
    kind: "outside",
    profitOdds: 1,
    covers: (winningNumber) =>
      winningNumber !== 0 &&
      !RED_NUMBERS.has(
        winningNumber,
      ),
  },
};

export function getRouletteBetRule(
  betId: string,
): RouletteBetRule | null {
  const outside =
    OUTSIDE_RULES[betId];
  if (outside) return outside;

  const straightMatch =
    /^straight-(\d+)$/.exec(
      betId,
    );
  if (straightMatch) {
    return createStraightRule(
      Number(straightMatch[1]),
    );
  }

  const columnMatch =
    /^column-(\d+)$/.exec(
      betId,
    );
  if (columnMatch) {
    return createColumnRule(
      Number(columnMatch[1]),
    );
  }

  const dozenMatch =
    /^dozen-(\d+)$/.exec(
      betId,
    );
  if (dozenMatch) {
    return createDozenRule(
      Number(dozenMatch[1]),
    );
  }

  return null;
}

export function isRouletteBetWinner(
  betId: string,
  winningNumber: number,
) {
  if (
    !isValidRouletteNumber(
      winningNumber,
    )
  ) {
    return false;
  }

  const rule =
    getRouletteBetRule(betId);

  return rule
    ? rule.covers(
        winningNumber,
      )
    : false;
}

export function getRouletteProfitOdds(
  betId: string,
) {
  return (
    getRouletteBetRule(
      betId,
    )?.profitOdds ?? null
  );
}

export function getWinningRouletteBetIds(
  winningNumber: number,
  betIds: readonly string[],
) {
  return Array.from(
    new Set(
      betIds.filter((betId) =>
        isRouletteBetWinner(
          betId,
          winningNumber,
        ),
      ),
    ),
  );
}

export function settleRouletteBets(
  placements: readonly RouletteBetPlacement[],
  winningNumber: number,
): RouletteRoundSettlement {
  if (
    !isValidRouletteNumber(
      winningNumber,
    )
  ) {
    throw new Error(
      `Invalid roulette winning number: ${winningNumber}`,
    );
  }

  const lines =
    placements.map<RouletteBetSettlementLine>(
      (placement) => {
        const rule =
          getRouletteBetRule(
            placement.betId,
          );

        if (!rule) {
          throw new Error(
            `Unknown roulette bet id: ${placement.betId}`,
          );
        }

        const won =
          rule.covers(
            winningNumber,
          );
        const grossReturn =
          won
            ? placement.amount *
              (
                rule.profitOdds +
                1
              )
            : 0;

        return {
          betId:
            placement.betId,
          amount:
            placement.amount,
          won,
          profitOdds:
            rule.profitOdds,
          grossReturn,
          netProfit:
            grossReturn -
            placement.amount,
        };
      },
    );

  const totalStake =
    lines.reduce(
      (sum, line) =>
        sum + line.amount,
      0,
    );
  const winningStake =
    lines.reduce(
      (sum, line) =>
        sum +
        (
          line.won
            ? line.amount
            : 0
        ),
      0,
    );
  const grossReturn =
    lines.reduce(
      (sum, line) =>
        sum +
        line.grossReturn,
      0,
    );

  return {
    winningNumber,
    totalStake,
    winningStake,
    grossReturn,
    netProfit:
      grossReturn -
      totalStake,
    winningBetIds:
      getWinningRouletteBetIds(
        winningNumber,
        lines.map(
          (line) =>
            line.betId,
        ),
      ),
    lines,
  };
}
