import { describe, expect, it } from 'vitest';
import { balanceTeams, type BalanceInput } from './balance';

function member(id: string, rating: number | null, position: BalanceInput['position'] = null) {
  return { id, rating, position };
}

describe('balanceTeams', () => {
  it('kadroyu ikiye esit boler', () => {
    const squad = Array.from({ length: 14 }, (_, i) => member(`p${i}`, 3));
    const teams = balanceTeams(squad);

    const black = Object.values(teams).filter((t) => t === 'black').length;
    const white = Object.values(teams).filter((t) => t === 'white').length;
    expect(black).toBe(7);
    expect(white).toBe(7);
  });

  it('tek sayida kadroda fark en fazla bir kisidir', () => {
    const squad = Array.from({ length: 9 }, (_, i) => member(`p${i}`, 3));
    const teams = balanceTeams(squad);

    const black = Object.values(teams).filter((t) => t === 'black').length;
    const white = Object.values(teams).filter((t) => t === 'white').length;
    expect(Math.abs(black - white)).toBe(1);
  });

  it('tam bolunebilen kadroyu esitler', () => {
    const squad = [member('a', 5), member('b', 4), member('c', 3), member('d', 2)];
    const teams = balanceTeams(squad);

    const sum = (team: string) =>
      squad
        .filter((m) => teams[m.id] === team)
        .reduce((total, m) => total + (m.rating as number), 0);

    // 5+2 = 4+3
    expect(sum('black')).toBe(sum('white'));
  });

  it('tam bolunemeyen kadroda farki en aza indirir', () => {
    const squad = [
      member('a', 5),
      member('b', 5),
      member('c', 4),
      member('d', 2),
      member('e', 1),
      member('f', 1),
    ];
    const teams = balanceTeams(squad);

    const sum = (team: string) =>
      squad
        .filter((m) => teams[m.id] === team)
        .reduce((total, m) => total + (m.rating as number), 0);

    // Toplam 18; ucerli bolmede ulasilabilecek en kucuk fark 2
    expect(Math.abs(sum('black') - sum('white'))).toBe(2);
  });

  it('iki kaleciyi ayri takimlara koyar', () => {
    const squad = [
      member('k1', 4, 'goalkeeper'),
      member('k2', 3, 'goalkeeper'),
      member('a', 4),
      member('b', 3),
      member('c', 2),
      member('d', 2),
    ];
    const teams = balanceTeams(squad);

    expect(teams.k1).not.toBe(teams.k2);
  });

  it('oy almamis oyuncuyu kadronun ortalamasi sayar', () => {
    const squad = [member('a', 4), member('b', 4), member('c', null), member('d', null)];
    const teams = balanceTeams(squad);

    // Iki yildizli oyuncu ayrilir, yildizsizlar karsilarina duser
    expect(teams.a).not.toBe(teams.b);
  });

  it('bos kadroda bos sonuc doner', () => {
    expect(balanceTeams([])).toEqual({});
  });
});
