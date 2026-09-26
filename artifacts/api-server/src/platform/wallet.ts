// Shared platform wallet contract.
// The backing SQL table retains the legacy "roulette_wallets" name to avoid a data migration.
export const INITIAL_SHARED_BALANCE_CENTS = 100_000;
export const SHARED_WALLET_TABLE = "roulette_wallets" as const;
