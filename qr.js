/* ============================================================
   最小 QR Code 編碼器 — byte mode、錯誤更正等級 M、版本 1–40
   依 ISO/IEC 18004 實作，無外部相依，可離線運作。
   qrEncode(text) -> { size, m: Uint8Array[size][size] }
   ============================================================ */
var QR = (function () {

  /* --- ISO/IEC 18004 區塊結構（等級 M）：[每區塊EC碼字, [[區塊數, 資料碼字], ...]] --- */
  var RS_M = [
    [10,[[1,16]]],[16,[[1,28]]],[26,[[1,44]]],[18,[[2,32]]],[24,[[2,43]]],
    [16,[[4,27]]],[18,[[4,31]]],[22,[[2,38],[2,39]]],[22,[[3,36],[2,37]]],[26,[[4,43],[1,44]]],
    [30,[[1,50],[4,51]]],[22,[[6,36],[2,37]]],[22,[[8,37],[1,38]]],[24,[[4,40],[5,41]]],[24,[[5,41],[5,42]]],
    [28,[[7,45],[3,46]]],[28,[[10,46],[1,47]]],[26,[[9,43],[4,44]]],[26,[[3,44],[11,45]]],[26,[[3,41],[13,42]]],
    [26,[[17,42]]],[28,[[17,46]]],[28,[[4,47],[14,48]]],[28,[[6,45],[14,46]]],[28,[[8,47],[13,48]]],
    [28,[[19,46],[4,47]]],[28,[[22,45],[3,46]]],[28,[[3,45],[23,46]]],[28,[[21,45],[7,46]]],[28,[[19,47],[10,48]]],
    [28,[[2,46],[29,47]]],[28,[[10,46],[23,47]]],[28,[[14,46],[21,47]]],[28,[[14,46],[23,47]]],[28,[[12,47],[26,48]]],
    [28,[[6,47],[34,48]]],[28,[[29,46],[14,47]]],[28,[[13,46],[32,47]]],[28,[[40,47],[7,48]]],[28,[[18,47],[31,48]]]
  ];
  var ALIGN = [[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],
               [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],
               [6,30,56,82],[6,30,58,86],[6,34,62,90],
               [6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],
               [6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],
               [6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],
               [6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]];

  /* --- GF(256) --- */
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function genPoly(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var ng = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); }
      g = ng;
    }
    return g;
  }
  function ecBytes(data, n) {
    var g = genPoly(n), res = new Uint8Array(data.length + n), i, j;
    res.set(data);
    for (i = 0; i < data.length; i++) {
      var f = res[i];
      if (f) for (j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], f);
    }
    return res.slice(data.length);
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str)), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  function capacity(v) {
    var r = RS_M[v - 1], n = 0;
    r[1].forEach(function (b) { n += b[0] * b[1]; });
    return n;
  }

  function encode(text) {
    var bytes = utf8(text), v;
    for (v = 1; v <= 40; v++) {
      var lenBits = v < 10 ? 8 : 16;
      if (4 + lenBits + bytes.length * 8 <= capacity(v) * 8) break;
    }
    if (v > 40) throw new Error('資料太長，超過 QR 容量上限');

    /* --- 位元串 --- */
    var bits = [];
    function put(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    put(4, 4);                                   // byte mode
    put(bytes.length, v < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) put(bytes[i], 8);
    var cap = capacity(v) * 8;
    for (var t = 0; t < 4 && bits.length < cap; t++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    var pad = [0xec, 0x11], p = 0;
    while (bits.length < cap) { put(pad[p++ % 2], 8); }

    var dataCw = new Uint8Array(bits.length / 8);
    for (var k = 0; k < dataCw.length; k++) {
      var b = 0;
      for (var q = 0; q < 8; q++) b = (b << 1) | bits[k * 8 + q];
      dataCw[k] = b;
    }

    /* --- 分區塊 + RS --- */
    var spec = RS_M[v - 1], ecLen = spec[0], blocks = [], ecs = [], pos = 0;
    spec[1].forEach(function (grp) {
      for (var n = 0; n < grp[0]; n++) {
        var d = dataCw.slice(pos, pos + grp[1]); pos += grp[1];
        blocks.push(d); ecs.push(ecBytes(d, ecLen));
      }
    });
    var maxD = Math.max.apply(null, blocks.map(function (b) { return b.length; }));
    var out = [];
    for (var c = 0; c < maxD; c++) for (var bi = 0; bi < blocks.length; bi++) if (c < blocks[bi].length) out.push(blocks[bi][c]);
    for (var e = 0; e < ecLen; e++) for (var bj = 0; bj < ecs.length; bj++) out.push(ecs[bj][e]);

    /* --- 矩陣骨架 --- */
    var size = 17 + 4 * v;
    var m = [], res = [];
    for (var r = 0; r < size; r++) { m.push(new Uint8Array(size)); res.push(new Uint8Array(size)); }
    function setF(r2, c2, val) { m[r2][c2] = val; res[r2][c2] = 1; }

    function finder(r0, c0) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var r2 = r0 + dr, c2 = c0 + dc;
        if (r2 < 0 || c2 < 0 || r2 >= size || c2 >= size) continue;
        var on = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                 (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
                 (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        setF(r2, c2, on ? 1 : 0);
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    for (var i2 = 8; i2 < size - 8; i2++) { setF(6, i2, i2 % 2 === 0 ? 1 : 0); setF(i2, 6, i2 % 2 === 0 ? 1 : 0); }

    var ap = ALIGN[v - 1];
    for (var a1 = 0; a1 < ap.length; a1++) for (var a2 = 0; a2 < ap.length; a2++) {
      var ar = ap[a1], ac = ap[a2];
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) continue;
      for (var dr2 = -2; dr2 <= 2; dr2++) for (var dc2 = -2; dc2 <= 2; dc2++) {
        var on2 = Math.max(Math.abs(dr2), Math.abs(dc2)) !== 1;
        setF(ar + dr2, ac + dc2, on2 ? 1 : 0);
      }
    }

    setF(size - 8, 8, 1);                                   // 固定暗模組
    for (var f1 = 0; f1 <= 8; f1++) { if (!res[8][f1]) res[8][f1] = 1; if (!res[f1][8]) res[f1][8] = 1; }
    for (var f2 = size - 8; f2 < size; f2++) { res[8][f2] = 1; res[f2][8] = 1; }

    if (v >= 7) {
      var vinfo = bch(v, 12, 0x1f25);
      for (var vi = 0; vi < 18; vi++) {
        var bit = (vinfo >> vi) & 1, aa = Math.floor(vi / 3), bb = vi % 3;
        setF(aa, size - 11 + bb, bit); setF(size - 11 + bb, aa, bit);
      }
    }

    /* --- 放資料（Z 字形） --- */
    var di = 0, up = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var n2 = 0; n2 < size; n2++) {
        var row = up ? size - 1 - n2 : n2;
        for (var s = 0; s < 2; s++) {
          var cc = col - s;
          if (res[row][cc]) continue;
          var bitv = 0;
          if (di < out.length * 8) bitv = (out[di >> 3] >> (7 - (di & 7))) & 1;
          m[row][cc] = bitv; di++;
        }
      }
      up = !up;
    }

    /* --- 選遮罩 --- */
    var best = null, bestScore = Infinity, bestMask = 0;
    for (var mk = 0; mk < 8; mk++) {
      var cand = applyMask(m, res, size, mk);
      putFormat(cand, size, mk);
      var sc = penalty(cand, size);
      if (sc < bestScore) { bestScore = sc; best = cand; bestMask = mk; }
    }
    return { size: size, m: best, version: v, mask: bestMask };
  }

  function maskFn(k, i, j) {
    switch (k) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
      case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
      default: return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0;
    }
  }
  function applyMask(m, res, size, k) {
    var o = [];
    for (var r = 0; r < size; r++) {
      o.push(new Uint8Array(size));
      for (var c = 0; c < size; c++) o[r][c] = res[r][c] ? m[r][c] : (m[r][c] ^ (maskFn(k, r, c) ? 1 : 0));
    }
    return o;
  }

  function bch(data, shift, poly) {
    var d = data << shift, g = poly, bitlen = 0, t = g;
    while (t) { bitlen++; t >>= 1; }
    var x = d;
    while (true) {
      var l = 0, y = x;
      while (y) { l++; y >>= 1; }
      if (l < bitlen) break;
      x ^= g << (l - bitlen);
    }
    return (data << shift) | x;
  }
  function putFormat(m, size, mask) {
    var fmt = bch((0 << 3) | mask, 10, 0x537) ^ 0x5412;   // 等級 M = 00
    function bit(i) { return (fmt >> i) & 1; }
    for (var i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8);
    for (var j = 9; j <= 14; j++) m[8][14 - j] = bit(j);
    for (var k = 0; k < 8; k++) m[8][size - 1 - k] = bit(k);
    for (var n = 8; n < 15; n++) m[size - 15 + n][8] = bit(n);
    m[size - 8][8] = 1;
  }

  function penalty(m, size) {
    var s = 0, r, c, i, run, dark = 0;
    for (r = 0; r < size; r++) {
      run = 1;
      for (c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) { run++; } else { if (run >= 5) s += run - 2; run = 1; }
      }
      if (run >= 5) s += run - 2;
    }
    for (c = 0; c < size; c++) {
      run = 1;
      for (r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) { run++; } else { if (run >= 5) s += run - 2; run = 1; }
      }
      if (run >= 5) s += run - 2;
    }
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
      var v0 = m[r][c];
      if (v0 === m[r][c + 1] && v0 === m[r + 1][c] && v0 === m[r + 1][c + 1]) s += 3;
    }
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function match(get, len, start) {
      var ok1 = true, ok2 = true;
      for (var q = 0; q < 11; q++) {
        var vv = get(start + q);
        if (vv !== pat1[q]) ok1 = false;
        if (vv !== pat2[q]) ok2 = false;
      }
      return ok1 || ok2;
    }
    for (r = 0; r < size; r++) for (c = 0; c + 11 <= size; c++) {
      if (match(function (x) { return m[r][x]; }, size, c)) s += 40;
    }
    for (c = 0; c < size; c++) for (r = 0; r + 11 <= size; r++) {
      if (match(function (x) { return m[x][c]; }, size, r)) s += 40;
    }
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
    var pct = dark * 100 / (size * size);
    s += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return s;
  }

  /* --- 輸出成 SVG --- */
  function svg(text, px, quiet) {
    var q = quiet == null ? 4 : quiet;
    var r = encode(text), n = r.size, total = n + q * 2, d = '';
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      if (r.m[i][j]) d += 'M' + (j + q) + ' ' + (i + q) + 'h1v1h-1z';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total +
      '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges" role="img">' +
      '<rect width="' + total + '" height="' + total + '" fill="#fff"/>' +
      '<path d="' + d + '" fill="#10202A"/></svg>';
  }

  return { encode: encode, svg: svg };
})();

if (typeof module !== 'undefined') module.exports = QR;
