import { describe, it, expect } from 'vitest';
import { evaluateWithdrawal } from './withdrawal';

const HOUR = 60 * 60 * 1000;
const KICKOFF = 1_000_000_000_000;

describe('evaluateWithdrawal', () => {
  it('pencere icinde cikista ceza yazmaz', () => {
    const result = evaluateWithdrawal({
      now: KICKOFF - 30 * HOUR,
      kickoffAt: KICKOFF,
      windowHours: 20,
      penaltySeconds: 8,
    });
    expect(result).toEqual({ isLate: false, penaltySeconds: 0 });
  });

  it('pencere kapandiktan sonra cikista ceza yazar', () => {
    const result = evaluateWithdrawal({
      now: KICKOFF - 5 * HOUR,
      kickoffAt: KICKOFF,
      windowHours: 20,
      penaltySeconds: 8,
    });
    expect(result).toEqual({ isLate: true, penaltySeconds: 8 });
  });

  it('tam sinir aninda cikis gec sayilir', () => {
    const result = evaluateWithdrawal({
      now: KICKOFF - 20 * HOUR,
      kickoffAt: KICKOFF,
      windowHours: 20,
      penaltySeconds: 8,
    });
    expect(result.isLate).toBe(true);
  });

  it('mac saatinden sonraki cikis da gec sayilir', () => {
    const result = evaluateWithdrawal({
      now: KICKOFF + HOUR,
      kickoffAt: KICKOFF,
      windowHours: 20,
      penaltySeconds: 8,
    });
    expect(result.isLate).toBe(true);
  });

  it('ceza sifir tanimlandiysa gec cikista da ceza yazmaz', () => {
    const result = evaluateWithdrawal({
      now: KICKOFF - HOUR,
      kickoffAt: KICKOFF,
      windowHours: 20,
      penaltySeconds: 0,
    });
    expect(result).toEqual({ isLate: true, penaltySeconds: 0 });
  });

  it('pencere sifir saat ise yalnizca mac saatinden sonrasi gec sayilir', () => {
    const early = evaluateWithdrawal({
      now: KICKOFF - HOUR,
      kickoffAt: KICKOFF,
      windowHours: 0,
      penaltySeconds: 8,
    });
    expect(early.isLate).toBe(false);
  });

  it('pencere sifir saatte mac zamaninda ve sonrasinda cikis gec sayilir', () => {
    const result = evaluateWithdrawal({
      now: KICKOFF,
      kickoffAt: KICKOFF,
      windowHours: 0,
      penaltySeconds: 8,
    });
    expect(result.isLate).toBe(true);
  });
});
