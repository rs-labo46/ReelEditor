export function displaySeconds(us: number): string {
  if (!Number.isSafeInteger(us) || us < 0)
    throw new Error("表示時刻が不正です");
  return (us / 1_000_000).toFixed(1);
}
