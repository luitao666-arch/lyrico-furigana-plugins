// 备用来源：按文字匹配每一行，取对应的罗马音

const NE_MAX_CANDIDATES = 5;
const NE_MAX_KEYWORDS = 3;
const NE_BUDGET_MS = 6000;
const CALL_LIMIT_MS = 10000;
let neDeadline = 0;
let neCallStart = 0;
const neSearchCache = {};
const neLyricCache = {};

function neStartBudget() { neCallStart = Date.now(); neDeadline = 0; }
function neCallTooLong() { return Date.now() - neCallStart > CALL_LIMIT_MS; }
function neOutOfBudget() { return neDeadline > 0 && Date.now() > neDeadline; }
const NE_GOOD_ENOUGH = 0.8;

function neNormalizeText(text) {
  let value = String(text || "");
  try { value = value.normalize("NFKC"); } catch (e) {}
  return value
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0x60); })
    .replace(/[\s\u3000]+/g, "")
    .replace(/[、。，,.!！?？…・·~～\-－—_"'“”‘’「」『』()（）\[\]【】:：;；\/／&＆♪☆★]/g, "");
}

function neSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = {};
  for (let i = 0; i < a.length - 1; i++) { const g = a.substr(i, 2); grams[g] = (grams[g] || 0) + 1; }
  let common = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.substr(i, 2);
    if (grams[g] > 0) { grams[g]--; common++; }
  }
  return 2 * common / (a.length + b.length - 2);
}

function neMedian(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort(function (a, b) { return a - b; });
  return sorted[Math.floor(sorted.length / 2)];
}

function neSearchSongs(keyword) {
  if (neSearchCache[keyword]) return neSearchCache[keyword];
  const root = eapiRequest("/eapi/search/song/list/page", {
    limit: "10",
    offset: "0",
    keyword: keyword,
    scene: "NORMAL",
    needCorrect: "true"
  });
  const resources = root && root.data && Array.isArray(root.data.resources) ? root.data.resources : [];
  neSearchCache[keyword] = resources.map(function (resource) {
    const song = resource && resource.baseInfo && resource.baseInfo.simpleSongData;
    if (!song || !song.id) return null;
    const album = song.al || song.album || {};
    const published = Number(song.publishTime || album.publishTime || 0);
    return {
      id: String(song.id),
      title: String(song.name || ""),
      album: String(album.name || ""),
      year: published > 0 ? String(new Date(published).getUTCFullYear()) : "",
      duration: Number(song.duration || song.dt || 0)
    };
  }).filter(Boolean);
  return neSearchCache[keyword];
}

function neFetchLyric(id) {
  if (neLyricCache[id]) return neLyricCache[id];
  const root = eapiRequest("/eapi/song/lyric/v1", { id: Number(id), lv: "-1", tv: "-1", rv: "-1", yv: "-1" });
  neLyricCache[id] = {
    lrc: root && root.lrc && root.lrc.lyric ? String(root.lrc.lyric) : "",
    romalrc: root && root.romalrc && root.romalrc.lyric ? String(root.romalrc.lyric) : ""
  };
  return neLyricCache[id];
}

function neLookup(original, lyric) {
  const neLines = neParseLrc(lyric.lrc);
  const romaByStart = {};
  neParseLrc(lyric.romalrc).forEach(function (line) { romaByStart[line[0]] = line[2]; });

  const byKey = {};
  neLines.forEach(function (line, index) {
    const roma = romaByStart[line[0]];
    const key = neNormalizeText(line[2]);
    if (roma && key) (byKey[key] = byKey[key] || []).push({ start: line[0], roma: roma, index: index });
  });

  const kgKeys = original.map(function (line) {
    return neNormalizeText((Array.isArray(line[2]) ? line[2] : []).map(function (word) {
      return Array.isArray(word) ? String(word[2] || "") : String(word || "");
    }).join(""));
  });

  const deltas = [];
  kgKeys.forEach(function (key, index) {
    const hits = byKey[key];
    if (key && hits && hits.length === 1) deltas.push(hits[0].start - Number(original[index][0] || 0));
  });
  const offset = neMedian(deltas);

  const flat = [];
  Object.keys(byKey).forEach(function (key) { byKey[key].forEach(function (hit) { flat.push({ key: key, hit: hit }); }); });

  const used = {};
  const found = {};
  let count = 0;
  kgKeys.forEach(function (key, index) {
    if (!key) return;
    const start = Number(original[index][0] || 0);
    let best = null;
    function consider(hit, penalty) {
      const dev = Math.abs(hit.start - start - offset);
      const score = dev + penalty + (used[hit.index] ? 100000 : 0);
      if (!best || score < best.score) best = { hit: hit, score: score };
    }
    (byKey[key] || []).forEach(function (hit) { consider(hit, 0); });
    if (!best) {
      flat.forEach(function (item) {
        if (Math.abs(item.hit.start - start - offset) > 6000) return;
        if (neSimilarity(key, item.key) >= 0.8) consider(item.hit, 50000);
      });
    }
    if (!best) return;
    used[best.hit.index] = true;
    found[index] = best.hit.roma;
    count++;
  });
  count += neLookupByContainment(original, kgKeys, neLines, romaByStart, offset, found);
  return { found: found, count: count };
}

function neSimpleWithMap(text) {
  let simple = "";
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (/[\s\u3000、。，,.!！?？…・·~～\-－—_"'“”‘’「」『』()（）\[\]【】:：;；\/／&＆♪☆★]/.test(ch)) continue;
    simple += ch;
    map.push(i);
  }
  return { simple: simple, map: map };
}

function neLookupByContainment(original, kgKeys, neLines, romaByStart, offset, found) {
  if (typeof Furigana !== "object" || !Furigana || typeof Furigana.sliceReading !== "function") return 0;
  const candidates = [];
  neLines.forEach(function (line, i) {
    const roma = romaByStart[line[0]];
    if (!roma) return;
    const end = neLines[i + 1] ? neLines[i + 1][0] : line[0] + 8000;
    candidates.push({ start: line[0], end: end, text: line[2], roma: roma, pair: false });
    const next = neLines[i + 1];
    if (next && romaByStart[next[0]]) {
      const after = neLines[i + 2] ? neLines[i + 2][0] : next[0] + 8000;
      candidates.push({ start: line[0], end: after, text: line[2] + next[2], roma: roma + " " + romaByStart[next[0]], pair: true });
    }
  });
  candidates.forEach(function (c) { const m = neSimpleWithMap(c.text); c.simple = m.simple; c.map = m.map; });

  let added = 0;
  original.forEach(function (line, index) {
    if (found[index]) return;
    const kg = neSimpleWithMap((Array.isArray(line[2]) ? line[2] : []).map(function (word) {
      return Array.isArray(word) ? String(word[2] || "") : String(word || "");
    }).join(""));
    if (kg.simple.length < 3) return;
    const start = Number(line[0] || 0);
    let best = null;
    candidates.forEach(function (c) {
      if (start + offset < c.start - 3000 || start + offset > c.end + 3000) return;
      const at = c.simple.indexOf(kg.simple);
      if (at < 0) return;
      const score = (c.pair ? 1 : 0) * 100000 + Math.abs(c.start - start - offset);
      if (!best || score < best.score) best = { c: c, at: at, score: score };
    });
    if (!best) return;
    const from = best.c.map[best.at];
    const to = best.c.map[best.at + kg.simple.length - 1] + 1;
    const piece = Furigana.sliceReading(best.c.text, best.c.roma, from, to);
    if (piece) { found[index] = piece; added++; }
  });
  return added;
}

function neTitleKey(title) {
  return neNormalizeText(String(title || "").replace(/\s*[\(（\[【「『].*$/, "").replace(/\s+[-－–—]\s+.*$/, ""));
}

function neMetaScore(song, candidate) {
  let score = 0;
  const kgTitle = neTitleKey(song.title);
  const neTitle = neTitleKey(candidate.title);
  if (kgTitle && neTitle && kgTitle === neTitle) score += 4;
  else if (kgTitle && neTitle && (kgTitle.indexOf(neTitle) >= 0 || neTitle.indexOf(kgTitle) >= 0)) score += 2;
  const kgAlbum = neNormalizeText(song.album);
  const neAlbum = neNormalizeText(candidate.album);
  if (kgAlbum && neAlbum && kgAlbum === neAlbum) score += 2;
  const kgYear = String(song.date || ((song.fields || {}).date) || "").slice(0, 4);
  if (kgYear && candidate.year && kgYear === candidate.year) score += 1;
  return score;
}

function neSearchKeywords(song) {
  const title = String(song.title || "").trim();
  const artist = String(song.artist || "").trim();
  const firstArtist = artist.split(/[\/、&,，]/)[0].trim();
  const cleanTitle = title.replace(/\s*[\(（\[【「『].*$/, "").replace(/\s+[-－–—]\s+.*$/, "").trim();
  const list = [];
  [[title, artist.replace(/[\/、&]/g, " ")], [cleanTitle, firstArtist], [title], [cleanTitle]].forEach(function (parts) {
    const keyword = parts.filter(Boolean).join(" ").trim();
    if (keyword && list.indexOf(keyword) < 0) list.push(keyword);
  });
  return list;
}

let neLastInfo = { candidates: 0, tried: 0, withRomaji: 0, best: 0, total: 0, outOfBudget: false, failed: "" };

function findNeteaseRomaji(original, song) {
  if (!neDeadline) neDeadline = Date.now() + NE_BUDGET_MS;
  const total = original.length || 1;
  const kgDuration = Number(song.duration || 0);
  const pool = [];
  const seen = {};
  const tried = {};
  let best = null;
  neLastInfo = { candidates: 0, tried: 0, withRomaji: 0, best: 0, total: total, outOfBudget: false, failed: "" };

  const keywords = neSearchKeywords(song);
  for (let k = 0; k < keywords.length && k < NE_MAX_KEYWORDS; k++) {
    if (neOutOfBudget()) { neLastInfo.outOfBudget = true; break; }
    let found;
    try { found = neSearchSongs(keywords[k]); } catch (e) { neLastInfo.failed = String(e && e.message ? e.message : e).slice(0, 60); continue; }
    found.forEach(function (c) { if (!seen[c.id]) { seen[c.id] = true; pool.push(c); } });
    neLastInfo.candidates = pool.length;

    const ordered = pool.map(function (c) {
      return { c: c, score: neMetaScore(song, c), gap: kgDuration > 0 ? Math.abs((c.duration || kgDuration) - kgDuration) : 0 };
    }).sort(function (a, b) { return b.score - a.score || a.gap - b.gap; }).map(function (item) { return item.c; });

    for (let i = 0; i < ordered.length && neLastInfo.tried < NE_MAX_CANDIDATES; i++) {
      if (neOutOfBudget()) { neLastInfo.outOfBudget = true; break; }
      if (tried[ordered[i].id]) continue;
      tried[ordered[i].id] = true;
      neLastInfo.tried++;
      let lyric;
      try { lyric = neFetchLyric(ordered[i].id); } catch (e) { neLastInfo.failed = String(e && e.message ? e.message : e).slice(0, 60); continue; }
      if (!lyric.lrc || !lyric.romalrc) continue;
      neLastInfo.withRomaji++;
      const result = neLookup(original, lyric);
      if (!best || result.count > best.count) best = result;
      neLastInfo.best = best.count;
      if (best.count / total >= NE_GOOD_ENOUGH) return best.found;
    }
    if (neLastInfo.outOfBudget) break;
    if (best && best.count / total >= 0.5) break;
  }
  return best && best.count ? best.found : null;
}
