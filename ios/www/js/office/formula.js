'use strict';
// Spreadsheet formulas: parser + evaluator (Excel compatible subset, English and
// Romanian function names), plus reference shifting for copy/fill/insert.

const Formula = (() => {
  // ---------------------------------------------------------------------------
  // Cell addresses
  // ---------------------------------------------------------------------------

  function colName(c) {
    let s = '';
    c++;
    while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
    return s;
  }
  function colIndex(name) {
    let c = 0;
    for (const ch of name.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
    return c - 1;
  }
  const addr = (r, c) => colName(c) + (r + 1);
  function parseAddr(a) {
    const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a);
    return m ? { r: +m[2] - 1, c: colIndex(m[1]) } : null;
  }

  // ---------------------------------------------------------------------------
  // Errors and values
  // ---------------------------------------------------------------------------

  class FErr { constructor(code) { this.code = code; } toString() { return this.code; } }
  const E = {
    DIV0: new FErr('#DIV/0!'), VALUE: new FErr('#VALUE!'), REF: new FErr('#REF!'), NAME: new FErr('#NAME?'),
    NA: new FErr('#N/A'), NUM: new FErr('#NUM!'), CIRC: new FErr('#CIRC!'),
  };
  const isErr = (v) => v instanceof FErr;

  // ---------------------------------------------------------------------------
  // Tokenizer
  // ---------------------------------------------------------------------------

  const REF_RE = /^(?:(?:'([^']+)'|([A-Za-z_][\w.]*))!)?(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?/;

  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let j = i + 1, s = '';
        for (; j < src.length; j++) {
          if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j++; continue; } break; }
          s += src[j];
        }
        out.push({ t: 'str', v: s, raw: src.slice(i, j + 1), at: i });
        i = j + 1;
        continue;
      }
      const rest = src.slice(i);
      const num = /^(\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
      if (num) {
        out.push({ t: 'num', v: parseFloat(num[0]), raw: num[0], at: i });
        i += num[0].length;
        continue;
      }
      const ref = REF_RE.exec(rest);
      if (ref && !/^[\w(]/.test(rest[ref[0].length] || '')) {
        out.push({ t: 'ref', sheet: ref[1] || ref[2] || null, a: ref[3], b: ref[4] || null, raw: ref[0], at: i });
        i += ref[0].length;
        continue;
      }
      const name = /^[A-Za-zĂÂÎȘȚăâîșțŞŢşţ_][\wĂÂÎȘȚăâîșțŞŢşţ.]*/.exec(rest);
      if (name) {
        out.push({ t: 'name', v: name[0], raw: name[0], at: i });
        i += name[0].length;
        continue;
      }
      const two = rest.slice(0, 2);
      if (two === '<=' || two === '>=' || two === '<>') { out.push({ t: 'op', v: two, raw: two, at: i }); i += 2; continue; }
      if ('+-*/^&=<>%'.includes(ch)) { out.push({ t: 'op', v: ch, raw: ch, at: i }); i++; continue; }
      if (ch === '(' || ch === ')') { out.push({ t: ch, raw: ch, at: i }); i++; continue; }
      if (ch === ',' || ch === ';') { out.push({ t: 'sep', raw: ch, at: i }); i++; continue; }
      throw new FErr('#NAME?');
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Parser (precedence climbing)
  // ---------------------------------------------------------------------------

  const PREC = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };

  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    function primary() {
      const t = next();
      if (!t) throw E.VALUE;
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'str') return { k: 'str', v: t.v };
      if (t.t === 'ref') return { k: 'ref', sheet: t.sheet, a: t.a, b: t.b };
      if (t.t === 'op' && (t.v === '-' || t.v === '+')) { const e = unary(); return t.v === '-' ? { k: 'neg', e } : e; }
      if (t.t === '(') { const e = expr(0); if (!peek() || peek().t !== ')') throw E.VALUE; next(); return e; }
      if (t.t === 'name') {
        const up = t.v.toUpperCase();
        if (peek() && peek().t === '(') {
          next();
          const args = [];
          if (peek() && peek().t !== ')') {
            for (;;) {
              if (peek() && (peek().t === 'sep' || peek().t === ')')) args.push({ k: 'empty' });
              else args.push(expr(0));
              if (peek() && peek().t === 'sep') { next(); continue; }
              break;
            }
          }
          if (!peek() || peek().t !== ')') throw E.VALUE;
          next();
          return { k: 'fn', name: up, args };
        }
        if (up === 'TRUE' || up === 'ADEVĂRAT' || up === 'ADEVARAT') return { k: 'bool', v: true };
        if (up === 'FALSE' || up === 'FALS') return { k: 'bool', v: false };
        throw E.NAME;
      }
      throw E.VALUE;
    }
    function unary() {
      let e = primary();
      while (peek() && peek().t === 'op' && peek().v === '%') { next(); e = { k: 'pct', e }; }
      return e;
    }
    function expr(minPrec) {
      let left = unary();
      for (;;) {
        const t = peek();
        if (!t || t.t !== 'op' || PREC[t.v] === undefined || PREC[t.v] < minPrec) break;
        next();
        const prec = PREC[t.v];
        const right = expr(t.v === '^' ? prec : prec + 1);
        left = { k: 'bin', op: t.v, l: left, r: right };
      }
      return left;
    }
    const ast = expr(0);
    if (p < toks.length) throw E.VALUE;
    return ast;
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  // ctx: { get(sheetName|null, r, c) -> value, sheetIndex(name) }
  function toNum(v) {
    if (isErr(v)) return v;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === null || v === undefined || v === '') return 0;
    const n = parseNumber(String(v));
    return n === null ? E.VALUE : n;
  }
  const toStr = (v) => (isErr(v) ? v : v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? fmtGeneral(v) : String(v));
  const toBool = (v) => (isErr(v) ? v : typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : typeof v === 'string' ? (/^(true|adevărat|adevarat)$/i.test(v) ? true : /^(false|fals)$/i.test(v) ? false : E.VALUE) : false);

  function rangeOf(node) {
    const a = parseAddr(node.a), b = node.b ? parseAddr(node.b) : a;
    if (!a || !b) return null;
    return { sheet: node.sheet, r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) };
  }

  function evalNode(n, ctx) {
    switch (n.k) {
      case 'num': return n.v;
      case 'str': return n.v;
      case 'bool': return n.v;
      case 'empty': return null;
      case 'neg': { const v = toNum(evalScalar(n.e, ctx)); return isErr(v) ? v : -v; }
      case 'pct': { const v = toNum(evalScalar(n.e, ctx)); return isErr(v) ? v : v / 100; }
      case 'ref': {
        const rg = rangeOf(n);
        if (!rg) return E.REF;
        if (rg.r0 === rg.r1 && rg.c0 === rg.c1) return ctx.get(rg.sheet, rg.r0, rg.c0);
        const rows = [];
        for (let r = rg.r0; r <= rg.r1; r++) { const row = []; for (let c = rg.c0; c <= rg.c1; c++) row.push(ctx.get(rg.sheet, r, c)); rows.push(row); }
        return { range: rows };
      }
      case 'bin': {
        const l = evalScalar(n.l, ctx), r = evalScalar(n.r, ctx);
        if (isErr(l)) return l;
        if (isErr(r)) return r;
        if (n.op === '&') return toStr(l) + toStr(r);
        if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) {
          let a = l, b = r;
          if (a === null) a = typeof b === 'string' ? '' : 0;
          if (b === null) b = typeof a === 'string' ? '' : 0;
          if (typeof a === 'string' && typeof b === 'string') { a = a.toLowerCase(); b = b.toLowerCase(); }
          else if (typeof a !== typeof b) { const ta = typeof a === 'string' ? 2 : typeof a === 'boolean' ? 3 : 1, tb = typeof b === 'string' ? 2 : typeof b === 'boolean' ? 3 : 1; a = ta; b = tb; }
          switch (n.op) {
            case '=': return a === b;
            case '<>': return a !== b;
            case '<': return a < b;
            case '>': return a > b;
            case '<=': return a <= b;
            default: return a >= b;
          }
        }
        const a = toNum(l), b = toNum(r);
        if (isErr(a)) return a;
        if (isErr(b)) return b;
        switch (n.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return b === 0 ? E.DIV0 : a / b;
          case '^': { const v = Math.pow(a, b); return Number.isFinite(v) ? v : E.NUM; }
        }
        return E.VALUE;
      }
      case 'fn': return callFn(n, ctx);
    }
    return E.VALUE;
  }

  function evalScalar(n, ctx) {
    const v = evalNode(n, ctx);
    if (v && v.range) {
      // implicit intersection: a 1x1 range is a value, otherwise #VALUE!
      return v.range.length === 1 && v.range[0].length === 1 ? v.range[0][0] : E.VALUE;
    }
    return v;
  }

  /** All values of the arguments, ranges flattened. */
  function flat(args, ctx) {
    const out = [];
    for (const a of args) {
      const v = evalNode(a, ctx);
      if (v && v.range) { for (const row of v.range) for (const x of row) out.push({ v: x, fromRange: true }); }
      else out.push({ v, fromRange: false });
    }
    return out;
  }

  function numbers(args, ctx) {
    const out = [];
    for (const { v, fromRange } of flat(args, ctx)) {
      if (isErr(v)) return v;
      if (typeof v === 'number') out.push(v);
      else if (!fromRange && v !== null && v !== '') { const n = toNum(v); if (isErr(n)) return n; out.push(n); }
    }
    return out;
  }

  function criteria(crit) {
    if (typeof crit === 'number') return (v) => typeof v === 'number' && v === crit;
    const s = String(crit == null ? '' : crit);
    const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s);
    const op = m[1] || '=', rhsRaw = m[2];
    const rhsNum = parseNumber(rhsRaw);
    const wild = /[*?]/.test(rhsRaw) ? new RegExp('^' + rhsRaw.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
    return (v) => {
      if (rhsNum !== null && typeof v === 'number') {
        switch (op) { case '=': return v === rhsNum; case '<>': return v !== rhsNum; case '<': return v < rhsNum; case '>': return v > rhsNum; case '<=': return v <= rhsNum; default: return v >= rhsNum; }
      }
      const a = String(v == null ? '' : v).toLowerCase(), b = rhsRaw.toLowerCase();
      if (op === '=') return wild ? wild.test(String(v == null ? '' : v)) : a === b;
      if (op === '<>') return wild ? !wild.test(String(v == null ? '' : v)) : a !== b;
      return false;
    };
  }

  function rangeArg(node, ctx) {
    const v = evalNode(node, ctx);
    if (v && v.range) return v.range;
    return [[v]];
  }

  const ALIASES = {
    SUMA: 'SUM', MEDIE: 'AVERAGE', CONTOR: 'COUNT', CONTA: 'COUNTA', DACĂ: 'IF', DACA: 'IF', DACĂEROARE: 'IFERROR', DACAEROARE: 'IFERROR',
    ROTUNJIRE: 'ROUND', ROTUNJIRESUS: 'ROUNDUP', ROTUNJIREJOS: 'ROUNDDOWN', AZI: 'TODAY', ACUM: 'NOW', ȘI: 'AND', SI: 'AND', SAU: 'OR', NU: 'NOT',
    CONCATENARE: 'CONCATENATE', PRODUS: 'PRODUCT', RADICAL: 'SQRT', PUTERE: 'POWER', ÎNTREG: 'INT', INTREG: 'INT', REST: 'MOD',
    LUNGIME: 'LEN', MAJUSCULE: 'UPPER', LITEREMARI: 'UPPER', LITEREMICI: 'LOWER', SPAȚII: 'TRIM', STÂNGA: 'LEFT', STANGA: 'LEFT', DREAPTA: 'RIGHT',
    SUMDACĂ: 'SUMIF', SUMDACA: 'SUMIF', CONTORDACĂ: 'COUNTIF', CONTORDACA: 'COUNTIF', CĂUTAREV: 'VLOOKUP', CAUTAREV: 'VLOOKUP', DATA: 'DATE', AN: 'YEAR', LUNA: 'MONTH', LUNĂ: 'MONTH', ZI: 'DAY',
  };

  function round(v, d, mode) {
    const k = Math.pow(10, d);
    const x = v * k;
    const r = mode === 'up' ? (x < 0 ? -Math.ceil(-x - 1e-9) : Math.ceil(x - 1e-9)) : mode === 'down' ? Math.trunc(x) : Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
    return r / k;
  }

  function serialToDate(s) { return new Date(Math.round((s - 25569) * 86400000)); }
  function dateToSerial(d) { return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) + 25569); }

  function callFn(n, ctx) {
    const name = ALIASES[n.name] || n.name;
    const A = n.args;
    const S = (i) => (A[i] ? evalScalar(A[i], ctx) : null);
    const N = (i) => toNum(S(i));
    const need = (min, max = min) => { if (A.length < min || A.length > max) throw E.VALUE; };
    try {
      switch (name) {
        case 'SUM': { const xs = numbers(A, ctx); return isErr(xs) ? xs : xs.reduce((a, b) => a + b, 0); }
        case 'AVERAGE': { const xs = numbers(A, ctx); if (isErr(xs)) return xs; return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : E.DIV0; }
        case 'MIN': { const xs = numbers(A, ctx); return isErr(xs) ? xs : xs.length ? Math.min(...xs) : 0; }
        case 'MAX': { const xs = numbers(A, ctx); return isErr(xs) ? xs : xs.length ? Math.max(...xs) : 0; }
        case 'PRODUCT': { const xs = numbers(A, ctx); return isErr(xs) ? xs : xs.reduce((a, b) => a * b, 1); }
        case 'COUNT': return flat(A, ctx).filter(({ v }) => typeof v === 'number').length;
        case 'COUNTA': return flat(A, ctx).filter(({ v }) => v !== null && v !== '').length;
        case 'COUNTBLANK': return flat(A, ctx).filter(({ v }) => v === null || v === '').length;
        case 'COUNTIF': { need(2); const rg = rangeArg(A[0], ctx), f = criteria(S(1)); let k = 0; for (const row of rg) for (const v of row) if (f(v)) k++; return k; }
        case 'SUMIF': {
          need(2, 3);
          const rg = rangeArg(A[0], ctx), f = criteria(S(1)), sr = A[2] ? rangeArg(A[2], ctx) : rg;
          let s = 0;
          rg.forEach((row, i) => row.forEach((v, j) => { if (f(v)) { const x = sr[i] && sr[i][j]; if (typeof x === 'number') s += x; } }));
          return s;
        }
        case 'AVERAGEIF': {
          need(2, 3);
          const rg = rangeArg(A[0], ctx), f = criteria(S(1)), sr = A[2] ? rangeArg(A[2], ctx) : rg;
          let s = 0, k = 0;
          rg.forEach((row, i) => row.forEach((v, j) => { if (f(v)) { const x = sr[i] && sr[i][j]; if (typeof x === 'number') { s += x; k++; } } }));
          return k ? s / k : E.DIV0;
        }
        case 'IF': { need(1, 3); const c = toBool(S(0)); if (isErr(c)) return c; return c ? (A[1] ? S(1) : true) : (A[2] ? S(2) : false); }
        case 'IFERROR': { need(2); const v = S(0); return isErr(v) ? S(1) : v; }
        case 'AND': { const vs = flat(A, ctx).map(({ v }) => v).filter((v) => v !== null && v !== ''); for (const v of vs) { const b = toBool(v); if (isErr(b)) return b; if (!b) return false; } return true; }
        case 'OR': { const vs = flat(A, ctx).map(({ v }) => v).filter((v) => v !== null && v !== ''); for (const v of vs) { const b = toBool(v); if (isErr(b)) return b; if (b) return true; } return false; }
        case 'NOT': { need(1); const b = toBool(S(0)); return isErr(b) ? b : !b; }
        case 'ROUND': case 'ROUNDUP': case 'ROUNDDOWN': {
          need(1, 2);
          const v = N(0), d = A[1] ? N(1) : 0;
          if (isErr(v)) return v;
          if (isErr(d)) return d;
          return round(v, Math.trunc(d), name === 'ROUNDUP' ? 'up' : name === 'ROUNDDOWN' ? 'down' : 'half');
        }
        case 'INT': { need(1); const v = N(0); return isErr(v) ? v : Math.floor(v); }
        case 'ABS': { need(1); const v = N(0); return isErr(v) ? v : Math.abs(v); }
        case 'SQRT': { need(1); const v = N(0); return isErr(v) ? v : v < 0 ? E.NUM : Math.sqrt(v); }
        case 'POWER': { need(2); const a = N(0), b = N(1); if (isErr(a)) return a; if (isErr(b)) return b; return Math.pow(a, b); }
        case 'MOD': { need(2); const a = N(0), b = N(1); if (isErr(a)) return a; if (isErr(b)) return b; if (b === 0) return E.DIV0; return a - b * Math.floor(a / b); }
        case 'PI': return Math.PI;
        case 'CONCATENATE': case 'CONCAT': { let s = ''; for (const { v } of flat(A, ctx)) { if (isErr(v)) return v; s += toStr(v); } return s; }
        case 'LEN': { need(1); const v = S(0); return isErr(v) ? v : toStr(v).length; }
        case 'UPPER': { need(1); const v = S(0); return isErr(v) ? v : toStr(v).toUpperCase(); }
        case 'LOWER': { need(1); const v = S(0); return isErr(v) ? v : toStr(v).toLowerCase(); }
        case 'TRIM': { need(1); const v = S(0); return isErr(v) ? v : toStr(v).trim().replace(/\s+/g, ' '); }
        case 'LEFT': { need(1, 2); const v = S(0), k = A[1] ? N(1) : 1; if (isErr(v)) return v; return toStr(v).slice(0, Math.max(0, k)); }
        case 'RIGHT': { need(1, 2); const v = S(0), k = A[1] ? N(1) : 1; if (isErr(v)) return v; const s = toStr(v); return k <= 0 ? '' : s.slice(-k); }
        case 'MID': { need(3); const v = S(0), a = N(1), k = N(2); if (isErr(v)) return v; return toStr(v).substr(Math.max(0, a - 1), Math.max(0, k)); }
        case 'TODAY': return dateToSerial(new Date());
        case 'NOW': { const d = new Date(); return dateToSerial(d) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; }
        case 'DATE': { need(3); const y = N(0), m = N(1), d = N(2); if ([y, m, d].some(isErr)) return E.VALUE; return Math.floor(Date.UTC(y, m - 1, d) / 86400000 + 25569); }
        case 'YEAR': { need(1); const v = N(0); return isErr(v) ? v : serialToDate(v).getUTCFullYear(); }
        case 'MONTH': { need(1); const v = N(0); return isErr(v) ? v : serialToDate(v).getUTCMonth() + 1; }
        case 'DAY': { need(1); const v = N(0); return isErr(v) ? v : serialToDate(v).getUTCDate(); }
        case 'VLOOKUP': {
          need(3, 4);
          const key = S(0), tbl = rangeArg(A[1], ctx), col = N(2);
          const approx = A[3] ? toBool(S(3)) : true;
          if (isErr(key)) return key;
          if (isErr(col) || col < 1) return E.VALUE;
          let hit = -1;
          for (let i = 0; i < tbl.length; i++) {
            const v = tbl[i][0];
            if (approx === false || typeof key === 'string') {
              if (String(v == null ? '' : v).toLowerCase() === String(key).toLowerCase() || v === key) { hit = i; break; }
            } else if (typeof v === 'number' && typeof key === 'number') {
              if (v <= key) hit = i; else break;
            }
          }
          if (hit < 0) return E.NA;
          const row = tbl[hit];
          return col - 1 < row.length ? row[col - 1] : E.REF;
        }
        default: return E.NAME;
      }
    } catch (e) {
      if (isErr(e)) return e;
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Numbers typed by people ("1.450,50", "58,5", "15%")
  // ---------------------------------------------------------------------------

  function parseNumber(s) {
    let t = String(s).trim().replace(/\s/g, '').replace(/lei$/i, '').replace(/ron$/i, '');
    if (!t) return null;
    if (!/^[+-]?[\d.,]+$/.test(t)) return null;
    if (t.includes(',') && t.includes('.')) {
      if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
      else t = t.replace(/,/g, '');
    } else if (t.includes(',')) {
      if (/^[+-]?\d{1,3}(,\d{3})+$/.test(t) && false) t = t.replace(/,/g, '');
      else t = t.replace(',', '.');
    } else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }

  function fmtGeneral(v) {
    if (!Number.isFinite(v)) return String(v);
    const r = Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0) ? v.toExponential(5) : String(Math.round(v * 1e10) / 1e10);
    return r.replace('.', ',');
  }

  // ---------------------------------------------------------------------------
  // Shifting references (copy, fill, insert/delete rows and columns)
  // ---------------------------------------------------------------------------

  /** Moves relative references by (dr, dc). Absolute parts ($) stay. */
  function shift(formula, dr, dc) {
    return mapRefs(formula, (ref) => {
      const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(ref);
      if (!m) return ref;
      let c = colIndex(m[2]), r = +m[4] - 1;
      if (!m[1]) c += dc;
      if (!m[3]) r += dr;
      if (c < 0 || r < 0) return '#REF!';
      return m[1] + colName(c) + m[3] + (r + 1);
    });
  }

  /** Adjusts references after inserting (n>0) or deleting (n<0) rows/cols at [at] on [sheet]. */
  function adjustStructure(formula, { rows, at, n, sheet, ownSheet }) {
    return mapRefs(formula, (ref, refSheet) => {
      const target = refSheet || ownSheet;
      if (target !== sheet) return ref;
      const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(ref);
      if (!m) return ref;
      let c = colIndex(m[2]), r = +m[4] - 1;
      if (rows) {
        if (n < 0 && r >= at && r < at - n) return '#REF!';
        if (r >= at) r += n;
      } else {
        if (n < 0 && c >= at && c < at - n) return '#REF!';
        if (c >= at) c += n;
      }
      return m[1] + colName(c) + m[3] + (r + 1);
    });
  }

  function mapRefs(formula, fn) {
    let toks;
    try { toks = tokenize(formula); } catch (e) { return formula; }
    let out = '', last = 0;
    for (const t of toks) {
      if (t.t !== 'ref') continue;
      out += formula.slice(last, t.at);
      const prefix = /^(?:'[^']+'|[A-Za-z_][\w.]*)!/.exec(t.raw);
      const sheet = t.sheet;
      let s = prefix ? prefix[0] : '';
      s += fn(t.a, sheet);
      if (t.b) s += ':' + fn(t.b, sheet);
      out += s.includes('#REF!') ? '#REF!' : s;
      last = t.at + t.raw.length;
    }
    return out + formula.slice(last);
  }

  /** Cells a formula reads (for highlighting while editing). */
  function refsIn(formula) {
    try {
      return tokenize(formula).filter((t) => t.t === 'ref').map((t) => ({ sheet: t.sheet, ...rangeOf(t) }));
    } catch (e) { return []; }
  }

  // ---------------------------------------------------------------------------
  // Compiled cache
  // ---------------------------------------------------------------------------

  const cache = new Map();
  function compile(src) {
    if (cache.has(src)) return cache.get(src);
    let ast;
    try { ast = parse(src); } catch (e) { ast = { k: 'error', e: isErr(e) ? e : E.VALUE }; }
    if (cache.size > 5000) cache.clear();
    cache.set(src, ast);
    return ast;
  }

  function evaluate(src, ctx) {
    const ast = compile(src);
    if (ast.k === 'error') return ast.e;
    try {
      const v = evalNode(ast, ctx);
      if (v && v.range) return v.range.length === 1 && v.range[0].length === 1 ? v.range[0][0] : E.VALUE;
      if (typeof v === 'number' && !Number.isFinite(v)) return E.NUM;
      return v === null ? 0 : v;
    } catch (e) {
      if (isErr(e)) return e;
      console.error(e);
      return E.VALUE;
    }
  }

  const FUNCTIONS = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'COUNTIF', 'SUMIF', 'AVERAGEIF', 'IF', 'IFERROR', 'AND', 'OR', 'NOT', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'INT', 'ABS', 'SQRT', 'POWER', 'MOD', 'PI', 'PRODUCT', 'CONCATENATE', 'LEN', 'UPPER', 'LOWER', 'TRIM', 'LEFT', 'RIGHT', 'MID', 'TODAY', 'NOW', 'DATE', 'YEAR', 'MONTH', 'DAY', 'VLOOKUP'];

  return { evaluate, parseNumber, fmtGeneral, shift, adjustStructure, refsIn, colName, colIndex, addr, parseAddr, isErr, E, FErr, serialToDate, dateToSerial, FUNCTIONS };
})();

if (typeof module !== 'undefined') module.exports = Formula;
