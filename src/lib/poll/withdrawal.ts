const HOUR_MS = 60 * 60 * 1000;

/**
 * Bir cikisin serbest pencere icinde mi yoksa gec mi oldugunu belirler.
 * Pencere mac saatinden geriye sayar: mac saatine `windowHours` kala kapanir.
 * Sinir aninda yapilan cikis gec sayilir.
 */
export function evaluateWithdrawal({
  now,
  kickoffAt,
  windowHours,
  penaltySeconds,
}: {
  now: number;
  kickoffAt: number;
  windowHours: number;
  penaltySeconds: number;
}): { isLate: boolean; penaltySeconds: number } {
  const windowClosesAt = kickoffAt - windowHours * HOUR_MS;
  const isLate = now >= windowClosesAt;

  return { isLate, penaltySeconds: isLate ? penaltySeconds : 0 };
}
