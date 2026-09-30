function trimCompactDecimals(
  value: string,
) {
  return value
    .replace(/\.0+$/, "")
    .replace(
      /(\.\d*[1-9])0+$/,
      "$1",
    );
}

export function formatRouletteAmount(
  value: number,
) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const sign =
    value < 0 ? "-" : "";
  const absolute =
    Math.abs(value);

  if (absolute < 1000) {
    return `${sign}${absolute}`;
  }

  const unit =
    absolute >= 1_000_000
      ? {
          divisor: 1_000_000,
          suffix: "M",
        }
      : {
          divisor: 1000,
          suffix: "K",
        };

  const scaled =
    absolute /
    unit.divisor;
  const decimals =
    scaled >= 100
      ? 0
      : scaled >= 10
        ? 1
        : 2;
  const compact =
    trimCompactDecimals(
      scaled.toFixed(decimals),
    );

  return `${sign}${compact}${unit.suffix}`;
}


export type RouletteAmountScale =
  | "short"
  | "medium"
  | "long";

export function getRouletteAmountScale(
  value: number,
): RouletteAmountScale {
  const label =
    formatRouletteAmount(value);

  if (label.length <= 3) {
    return "short";
  }

  if (label.length === 4) {
    return "medium";
  }

  return "long";
}


export type RouletteBalanceScale =
  | "normal"
  | "compact"
  | "tight";

export function formatRouletteBalance(
  value: number,
) {
  if (!Number.isFinite(value)) {
    return "$0";
  }

  const sign = value < 0 ? "-$" : "$";
  const absolute = Math.abs(value);
  const formatted =
    absolute.toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      },
    );

  return `${sign}${formatted}`;
}

export function getRouletteBalanceScale(
  value: number,
): RouletteBalanceScale {
  const length =
    formatRouletteBalance(value).length;

  if (length <= 10) {
    return "normal";
  }

  if (length <= 14) {
    return "compact";
  }

  return "tight";
}


export function formatRouletteMoney(
  value: number,
) {
  if (!Number.isFinite(value)) {
    return "$0";
  }

  const absolute =
    formatRouletteAmount(
      Math.abs(value),
    );

  return value < 0
    ? `-$${absolute}`
    : `$${absolute}`;
}

export function formatRouletteSignedMoney(
  value: number,
) {
  if (value > 0) {
    return `+${formatRouletteMoney(value)}`;
  }

  return formatRouletteMoney(value);
}
