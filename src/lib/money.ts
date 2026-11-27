export function sumMoney(amounts: readonly number[]): number {
  return amounts.reduce((cents, amount) => cents + Math.round(amount * 100), 0) / 100
}
