export function agorotToShekels(a: number): number {
  return Math.round(a) / 100;
}
export function shekelsToAgorot(s: number): number {
  return Math.round(s * 100);
}
export function amountMatches(transactionAmountShekels: number, orderTotalAgorot: number): boolean {
  return shekelsToAgorot(transactionAmountShekels) === orderTotalAgorot;
}
