const F = require('../app/js/office/formula.js');
const cells = { 'S1': { '0,0': 'Filtru', '0,1': 1, '0,2': 65, '1,0': 'Ulei', '1,1': 7, '1,2': 58.5, '2,0': 'Plăcuțe', '2,1': 1, '2,2': 320 }, 'Clienti': { '0,0': 'Ion', '0,1': 100 } };
const formulas = { 'S1': { '0,3': 'B1*C1', '1,3': 'B2*C2', '2,3': 'B3*C3', '4,3': 'SUM(D1:D3)', '5,0': 'A6' } };
const val = (sh, r, c, seen = new Set()) => {
  const f = formulas[sh] && formulas[sh][`${r},${c}`];
  if (f) { const k = sh + r + ',' + c; if (seen.has(k)) return F.E.CIRC; seen.add(k); const v = F.evaluate(f, ctxFor(sh, seen)); seen.delete(k); return v; }
  const v = cells[sh] && cells[sh][`${r},${c}`];
  return v === undefined ? null : v;
};
const ctxFor = (sh, seen) => ({ get: (s, r, c) => val(s || sh, r, c, seen) });
const ctx = ctxFor('S1', new Set());
const t = (f, exp) => { const v = F.evaluate(f, ctx); const ok = String(v) === String(exp); console.log(ok ? 'ok ' : 'BAD', f, '=>', String(v), ok ? '' : 'expected ' + exp); };
t('D5', 794.5); t('SUM(D1:D3)*2', 1589); t('1+2*3^2', 19); t('-2^2', 4); t('10%', 0.1); t('"a"&"b"&1', 'ab1');
t('IF(D5>500,"mare","mic")', 'mare'); t('DACĂ(D5<500;"mare";"mic")', 'mic'); t('SUMA(C1:C3)', 443.5); t('MEDIE(B1:B3)', 3);
t('ROUND(2.345,2)', 2.35); t('ROUND(-2.5,0)', -3); t('1/0', '#DIV/0!'); t('IFERROR(1/0,"x")', 'x'); t('COUNTIF(B1:B3,">1")', 1);
t('SUMIF(A1:A3,"Ulei",C1:C3)', 58.5); t('VLOOKUP("Ulei",A1:C3,3,FALSE)', 58.5); t('Clienti!B1+1', 101); t("'Clienti'!A1", 'Ion');
t('LEN("ăîș")', 3); t('UPPER(A3)', 'PLĂCUȚE'); t('MAX(C1:C3)-MIN(C1:C3)', 261.5); t('A6', '#CIRC!'); t('FOO(1)', '#NAME?'); t('AND(1>0,2>1)', true);
t('CONCATENATE(A1," x",B2)', 'Filtru x7'); t('DATE(2026,10,5)', 46300); t('MOD(-7,3)', 2); t('2*(3+4', '#VALUE!');
console.log(F.shift('B1*C1+$A$1+SUM(D1:D3)+Clienti!B1', 2, 1));
console.log(F.adjustStructure('SUM(D1:D3)+B5', { rows: true, at: 1, n: 1, sheet: 'S1', ownSheet: 'S1' }));
console.log(F.adjustStructure('SUM(D1:D3)+B2', { rows: true, at: 1, n: -1, sheet: 'S1', ownSheet: 'S1' }));
console.log(['58,5', '1.450,50', '1450.5', '1,450.5', '-3', 'abc', '1.000.000'].map((s) => F.parseNumber(s)));
