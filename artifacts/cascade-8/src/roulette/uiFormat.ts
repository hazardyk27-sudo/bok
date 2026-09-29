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
