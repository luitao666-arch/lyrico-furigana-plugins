function mapSong(item, request) {
  const singer = Array.isArray(item.singer) ? item.singer.map(x => x.name || "").filter(Boolean) : [];
  const album = item.album || {};
  const title = String(item.title || "");
  const artist = singer.join(request.separator || "/");
  const albumName = String(album.name || "");
  const date = String(item.time_public || "");
  return {
    id: String(item.id || ""),
    title: title,
    artist: artist,
    album: albumName,
    duration: Number(item.interval || 0) * 1000,
    date: date,
    fields: { title: title, artist: artist, album: albumName, date: date },
    internal: { language: item.language === undefined ? -1 : Number(item.language) }
  };
}

function extractMusicuSongs(response) {
  const body = (((response || {}).req_0 || {}).data || {}).body || {};
  if (Array.isArray(body.item_song)) return body.item_song;
  const list = (body.song || {}).list;
  return Array.isArray(list) ? list : [];
}

function expandSongVersions(items, request, normalize) {
  const pending = items.slice().reverse();
  const visited = new Set();
  const seenIds = new Set();
  const songs = [];
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== "object" || visited.has(item)) continue;
    visited.add(item);
    const group = Array.isArray(item.grp) ? item.grp : [];
    for (let i = group.length - 1; i >= 0; i--) pending.push(group[i]);
    const song = mapSong(normalize ? normalize(item) : item, request);
    if (!song.id || !song.title || seenIds.has(song.id)) continue;
    seenIds.add(song.id);
    songs.push(song);
  }
  return songs;
}

function normalizeWebSong(item) {
  const pubtime = Number(item.pubtime || 0);
  let date = "";
  if (isFinite(pubtime) && pubtime > 0) {
    const d = new Date((pubtime + 8 * 3600) * 1000);
    const month = String(d.getUTCMonth() + 1);
    const day = String(d.getUTCDate());
    date = d.getUTCFullYear() + "-" +
      (month.length < 2 ? "0" + month : month) + "-" +
      (day.length < 2 ? "0" + day : day);
  }
  return {
    id: item.songid,
    mid: item.songmid,
    title: item.songname,
    singer: item.singer,
    album: { name: item.albumname, mid: item.albummid },
    interval: item.interval,
    time_public: date
  };
}

function searchSongs(request) {
  const page = Number(request.page || 1);
  const pageSize = Number(request.pageSize || 20);
  const query = String(request.keyword || "");

  const liteParam = {
    search_id: randomSearchId(),
    remoteplace: "search.android.keyboard",
    query: query,
    search_type: 0,
    num_per_page: pageSize,
    page_num: page,
    highlight: 0,
    nqc_flag: 0,
    page_id: 1,
    grp: 1
  };
  const desktopParam = {
    grp: 1,
    num_per_page: pageSize,
    page_num: page,
    query: query,
    search_type: 0
  };

  const attempts = [
    ["lite", function() {
      return extractMusicuSongs(postMusicu("music.search.SearchCgiService", "DoSearchForQQMusicLite", liteParam));
    }],
    ["desktop", function() {
      return extractMusicuSongs(postMusicuDesktop("music.search.SearchCgiService", "DoSearchForQQMusicDesktop", desktopParam));
    }],
    ["web", function() {
      const response = getWebSearch(query, page, pageSize);
      const list = (((response || {}).data || {}).song || {}).list;
      return Array.isArray(list) ? list : [];
    }]
  ];

  if (request.fast) {
    attempts.length = 2;
    attempts.reverse();
  }

  let networkOk = false;
  let lastError = null;

  for (let i = 0; i < attempts.length; i++) {
    const name = attempts[i][0];
    try {
      const songs = expandSongVersions(attempts[i][1](), request, name === "web" ? normalizeWebSong : null);
      networkOk = true;
      if (songs.length) return songs;
      Platform.log.debug("QQ", name + " search returned no songs");
    } catch (e) {
      lastError = e;
      Platform.log.debug("QQ", name + " search failed: " + String(e && e.message ? e.message : e));
    }
  }

  if (!networkOk && lastError) throw lastError;
  return [];
}

function isEnabled(value) {
  return value === true || value === "true";
}

function lineTextOf(line) {
  return (Array.isArray(line[2]) ? line[2] : []).map(function(word) { return Array.isArray(word) ? String(word[2] || "") : ""; }).join("");
}

function isJapaneseLyrics(text) {
  const kana = (String(text || "").match(/[぀-ゟ゠-ヿ]/g) || []).length;
  const han = (String(text || "").match(/[一-鿿]/g) || []).length;
  return kana >= 10 && kana / (kana + han) >= 0.15;
}

function alignRomaji(original, romaLines) {
  const words = original.map(function(line) { return Array.isArray(line[2]) ? line[2].map(function() { return []; }) : []; });
  const lineFor = function(start) {
    let best = -1;
    let bestDist = 300;
    for (let i = 0; i < original.length; i++) {
      const dist = Math.abs(Number(original[i][0]) - start);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  };
  romaLines.forEach(function(roma) {
    const li = lineFor(Number(roma[0]));
    if (li < 0 || !words[li].length) return;
    const orig = original[li][2];
    (roma[2] || []).forEach(function(syllable) {
      const text = String(syllable[2] || "").trim();
      if (!text) return;
      const mid = (Number(syllable[0]) + Number(syllable[1])) / 2;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < orig.length; i++) {
        const start = Number(orig[i][0]);
        const end = Number(orig[i][1]);
        const dist = mid >= start && mid < end ? 0 : Math.min(Math.abs(mid - start), Math.abs(mid - end));
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      words[li][best].push(text);
    });
  });
  const wordRomaji = [];
  const lineRomaji = [];
  words.forEach(function(perWord, index) {
    const joined = perWord.map(function(parts) { return parts.join(" "); });
    if (joined.some(Boolean)) {
      wordRomaji[index] = joined;
      lineRomaji.push([original[index][0], original[index][1], joined.filter(Boolean).join(" ")]);
    }
  });
  return { wordRomaji: wordRomaji, lineRomaji: lineRomaji.length ? lineRomaji : null };
}

function getLyricsForSong(request, song) {
  const id = Number(song.id || 0);
  if (!id) return null;

  const response = postMusicu("music.musichallSong.PlayLyricInfo", "GetPlayLyricInfo", {
    songID: id,
    songName: Platform.base64.encodeText(song.title || ""),
    albumName: Platform.base64.encodeText(song.album || ""),
    singerName: Platform.base64.encodeText(song.artist || ""),
    crypt: 1,
    qrc: 1,
    trans: 1,
    roma: 1,
    cv: 2111,
    ct: 19,
    lrc_t: 0,
    qrc_t: 0,
    roma_t: 0,
    trans_t: 0,
    type: 0,
    interval: Math.round(Number(song.duration || 0) / 1000)
  });
  const data = ((response.req_0 || {}).data || {});
  const qrc = data.lyric ? decodeQqLyricPayload(data.lyric) : "";
  if (!qrc) return null;

  const original = parseQrcFormat(qrc);
  if (!original.length) return null;
  if (!isJapaneseLyrics(original.map(lineTextOf).join("\n"))) return NOT_JAPANESE;

  const trans = data.trans ? decodeQqLyricPayload(data.trans) : "";
  const roma = data.roma ? decodeQqLyricPayload(data.roma) : "";
  const aligned = roma ? alignRomaji(original, parseQrcFormat(roma)) : { wordRomaji: [], lineRomaji: null };

  const result = {
    type: "structured",
    tags: { ti: song.title || "", ar: song.artist || "", al: song.album || "" },
    original: original,
    translated: lyricsMerge(original, parseLrcFormat(trans)),
    romanization: aligned.lineRomaji
  };

  let annotated = result;
  try {
    if (typeof Furigana === "object" && Furigana && Furigana.annotateLyricsResult) {
      annotated = Furigana.annotateLyricsResult(result, aligned.wordRomaji, furiganaOptions(request));
    }
  } catch (e) {
    Platform.log.warn("Furigana", String(e && e.message ? e.message : e));
  }
  Object.defineProperty(annotated, "furiganaLineRomaji", { value: aligned.lineRomaji || [], enumerable: false, writable: true, configurable: true });
  return annotated;
}

function furiganaOptions(request) {
  return { pureDigits: isEnabled((request.config || {}).pure_digits) };
}

function hasRubyLine(line) {
  return Array.isArray(line) && Array.isArray(line[2]) && line[2].some(function(word) { return Array.isArray(word) && Array.isArray(word[3]) && word[3].length > 0; });
}

function hasUnannotatedKanji(lyrics) {
  return lyrics.original.some(function(line, index) {
    const text = lineTextOf(line);
    if (!/[一-鿿々]/.test(text) || hasRubyLine(line)) return false;
    if (index < 8 && (/[：:]/.test(text.slice(0, 12)) || /\s-\s/.test(text))) return false;
    return true;
  });
}

function hasKanjiLine(lyrics) {
  return lyrics.original.some(function(line) { return /[一-鿿々]/.test(lineTextOf(line)); });
}

const LINE_KEY_DROP = /[\s　、。，,.!！?？…・:：;；"“”「」『』()（）\[\]【】~～―—\/／-]/;

function normalizeLine(text) {
  const chars = [];
  const map = [];
  const value = String(text || "");
  for (let i = 0; i < value.length; i++) {
    if (LINE_KEY_DROP.test(value.charAt(i))) continue;
    chars.push(value.charAt(i).toLowerCase());
    map.push(i);
  }
  return { key: chars.join(""), map: map };
}

function buildRomajiSources(results) {
  return results.map(function(lyrics) {
    const byStart = {};
    (lyrics.furiganaLineRomaji || []).forEach(function(line) { byStart[String(line[0])] = line[2]; });
    return lyrics.original.map(function(line) {
      const text = lineTextOf(line);
      const romaji = byStart[String(line[0])];
      const norm = normalizeLine(text);
      return { text: text, key: norm.key, map: norm.map, romaji: romaji && hasRubyLine(line) ? romaji : null };
    });
  });
}

function lookupSharedRomaji(sources, text) {
  const target = normalizeLine(text).key;
  if (!target) return null;
  for (let s = 0; s < sources.length; s++) {
    const lines = sources[s];
    for (let i = 0; i < lines.length; i++) {
      let joined = "";
      const parts = [];
      for (let n = 0; n < 3 && i + n < lines.length; n++) {
        const line = lines[i + n];
        if (!line.romaji || !line.key) break;
        joined += line.key;
        parts.push(line.romaji);
        if (joined === target) return parts.join(" ");
        if (joined.length >= target.length) break;
      }
    }
  }
  if (target.length < 3 || typeof Furigana.sliceReading !== "function") return null;
  for (let s = 0; s < sources.length; s++) {
    const lines = sources[s];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.romaji || line.key.length <= target.length) continue;
      let at = line.key.indexOf(target);
      let found = null;
      let consistent = true;
      while (at >= 0) {
        const reading = Furigana.sliceReading(line.text, line.romaji, line.map[at], line.map[at + target.length - 1] + 1);
        if (!reading || (found && found !== reading)) { consistent = false; break; }
        found = reading;
        at = line.key.indexOf(target, at + 1);
      }
      if (consistent && found) return found;
    }
  }
  return null;
}

function shareRomaji(request, results) {
  if (typeof Furigana !== "object" || !Furigana || !Furigana.annotateLyricsResult) return;
  const sources = buildRomajiSources(results);
  results.forEach(function(lyrics) {
    const lines = [];
    lyrics.original.forEach(function(line) {
      const text = lineTextOf(line);
      if (hasRubyLine(line) || !/[一-鿿々]/.test(text)) return;
      const romaji = lookupSharedRomaji(sources, text);
      if (romaji) lines.push([line[0], line[1], romaji]);
    });
    if (!lines.length) return;
    try {
      const probe = {};
      Object.keys(lyrics).forEach(function(key) { probe[key] = lyrics[key]; });
      probe.romanization = lines;
      const second = Furigana.annotateLyricsResult(probe, null, furiganaOptions(request));
      if (second.original === probe.original) return;
      lyrics.original = second.original;
      lyrics.romanization = null;
      lyrics.timing = "Word";
      lyrics.language = "ja";
    } catch (e) {
      Platform.log.warn("Furigana", String(e && e.message ? e.message : e));
    }
  });
}

const MAX_CANDIDATES = 12;
const NOT_JAPANESE = { notJapanese: true };
const BATCH_FETCH = 3;
const BATCH_TIME_BUDGET_MS = 7000;
const TIME_BUDGET_MS = 9000;

function baseTitle(title) {
  return normalizeLine(String(title || "").replace(/[(（\[【～〜].*$/, "").replace(/\s+-\s+.*$/, "")).key;
}

function querySpans(query) {
  const tokens = String(query || "").split(/[\s\u3000\/／、,，]+/).map(function(t) { return normalizeLine(t).key; }).filter(Boolean);
  const spans = {};
  for (let i = 0; i < tokens.length; i++) {
    let joined = "";
    for (let j = i; j < tokens.length && j < i + 6; j++) {
      joined += tokens[j];
      spans[joined] = true;
    }
  }
  return Object.keys(spans);
}

function sharedChars(a, b) {
  const han = /[一-鿿々]/;
  const left = Array.from(a).filter(function(ch) { return han.test(ch); });
  const right = Array.from(b).filter(function(ch) { return han.test(ch); });
  if (left.length < 2 || right.length < 2) return 0;
  const pool = right.slice();
  let common = 0;
  left.forEach(function(ch) {
    const at = pool.indexOf(ch);
    if (at >= 0) { common++; pool.splice(at, 1); }
  });
  return common / Math.min(left.length, right.length);
}

function selectCandidates(songs, query, requested) {
  const spans = querySpans(query);
  if (!spans.length) return songs;
  const titleRank = function(song) {
    const title = baseTitle(song.title);
    if (!title) return 9;
    if (spans.indexOf(title) >= 0) return 0;
    return spans.some(function(span) { return span.length >= 2 && (title.indexOf(span) >= 0 || span.indexOf(title) >= 0); }) ? 2 : 9;
  };
  const artistRank = function(song) {
    const artist = normalizeLine(song.artist).key;
    if (!artist) return 1;
    return spans.some(function(span) { return span.length >= 2 && (artist.indexOf(span) >= 0 || span.indexOf(artist) >= 0 || sharedChars(artist, span) >= 0.6); }) ? 0 : 1;
  };
  const anchors = songs.filter(function(song) { return titleRank(song) < 9; });
  if (!anchors.length) return songs;
  const sameWork = function(song) {
    return anchors.some(function(other) {
      return normalizeLine(other.artist).key === normalizeLine(song.artist).key &&
        Math.abs(Number(other.duration || 0) - Number(song.duration || 0)) <= 1000;
    });
  };
  const wantedDuration = Number((requested || {}).duration || 0);
  const wantedAlbum = normalizeLine((requested || {}).album).key;
  const wantedDate = String((requested || {}).date || "").slice(0, 4);
  const closeness = function(song) {
    let penalty = 0;
    if (wantedDuration > 0 && Number(song.duration) > 0) {
      const diff = Math.abs(wantedDuration - Number(song.duration));
      penalty += (diff <= 1500 ? 0 : diff <= 3000 ? 1 : diff <= 8000 ? 2 : 3) * 10;
    }
    if (wantedAlbum && normalizeLine(song.album).key !== wantedAlbum) penalty += 1;
    if (wantedDate && String(song.date || "").slice(0, 4) !== wantedDate) penalty += 1;
    return penalty;
  };
  return songs
    .map(function(song, index) { return { song: song, index: index, rank: Math.min(titleRank(song), sameWork(song) ? 3 : 9) + artistRank(song) }; })
    .filter(function(item) { return item.rank < 9; })
    .map(function(item) { item.close = closeness(item.song); return item; })
    .sort(function(x, y) { return x.rank - y.rank || x.close - y.close || x.index - y.index; })
    .map(function(item) { return item.song; });
}

let batchDonors = [];

function searchCandidates(request, requestedSong) {
  batchDonors = [];
  const title = String(requestedSong.title || "");
  const artist = String(requestedSong.artist || "");
  const query = [title, artist].filter(Boolean).join(" ");
  if (!query.trim()) return [];
  const keywords = [query];
  if (title && artist) keywords.push(title);
  const local = isLocalLookup(requestedSong);
  const found = [];
  const seen = {};
  let selected = [];
  const started = Date.now();
  for (let index = 0; index < keywords.length; index++) {
    if (index > 0 && !local && Date.now() - started > 5000) break;
    let list = [];
    try {
      list = searchSongs({ keyword: keywords[index], page: request.page || 1, pageSize: local ? (request.pageSize || 5) : 20, separator: "/", config: request.config || {}, fast: !local });
    } catch (e) {
      if (index === 0) throw e;
    }
    list.forEach(function(song) {
      if (seen[song.id]) return;
      seen[song.id] = true;
      found.push(song);
    });
    selected = selectCandidates(found, query, requestedSong);
    if (!local) {
      const sameTitle = found.filter(function(song) { return titleMatches(song, title); });
      if (sameTitle.length && !sameTitle.some(isJapaneseTagged)) return [];
      selected = selected.filter(function(song) { return confidentMatch(song, requestedSong); });
      const japanese = selected.filter(isJapaneseTagged);
      if (selected.length && !japanese.length) return [];
      selected = japanese;
      if (selected.length) {
        batchDonors = found.filter(function(song) {
          return isJapaneseTagged(song) && titleMatches(song, title) && selected.indexOf(song) < 0 &&
            (artistMatches(song, artist) || selected.some(function(main) { return normalizeLine(main.artist).key === normalizeLine(song.artist).key; }));
        });
        break;
      }
    }
  }
  return selected.slice(0, local ? MAX_CANDIDATES : BATCH_FETCH);
}

function isJapaneseTagged(song) {
  const language = Number(((song || {}).internal || {}).language);
  return !(language >= 0) || language === 3;
}

function titleMatches(song, wanted) {
  const a = baseTitle(song.title);
  const b = baseTitle(wanted);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 2 && longer.indexOf(shorter) >= 0 && shorter.length / longer.length >= 0.75;
}

function artistMatches(song, wanted) {
  const a = normalizeLine(song.artist).key;
  const b = normalizeLine(wanted).key;
  if (!a || !b) return false;
  return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0 || sharedChars(a, b) >= 0.6;
}

function confidentMatch(song, wanted) {
  if (!titleMatches(song, wanted.title)) return false;
  const duration = Number(wanted.duration || 0);
  if (!(duration > 0) || !(Number(song.duration) > 0)) return false;
  const gap = Math.abs(duration - Number(song.duration));
  if (artistMatches(song, wanted.artist)) return gap <= 3000;
  return gap <= 1500 && baseTitle(song.title) === baseTitle(wanted.title);
}

function isSongId(id) {
  return /^\d+$/.test(String(id || ""));
}

function isLocalLookup(song) {
  return !song || !song.id || song.id === "local-song";
}

function getLyrics(request) {
  const startedAt = Date.now();
  const requestedSong = request.song || {};
  const batch = !isSongId(requestedSong.id) && !isLocalLookup(requestedSong);
  let songs = isSongId(requestedSong.id)
    ? [requestedSong]
    : searchCandidates(request, requestedSong);

  const seenSongs = {};
  songs = songs.filter(function(song) {
    const key = [song.title, song.artist, song.album, String(song.date || ((song.fields || {}).date) || ""), String(Math.round(Number(song.duration || 0) / 1000))].join("|").toLowerCase();
    if (seenSongs[key]) return false;
    seenSongs[key] = true;
    return true;
  });

  const budget = batch ? BATCH_TIME_BUDGET_MS : TIME_BUDGET_MS;
  const skippedWorks = {};
  const candidates = [];
  const origins = [];
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    if (candidates.length && Date.now() - startedAt > budget) break;
    const work = baseTitle(song.title) + "|" + normalizeLine(song.artist).key;
    if (skippedWorks[work]) continue;
    try {
      const lyrics = getLyricsForSong(request, song);
      if (lyrics === NOT_JAPANESE) {
        if (batch) break;
        skippedWorks[work] = true;
        continue;
      }
      const year = String(song.date || ((song.fields || {}).date) || "");
      if (!lyrics || !song.title || !song.artist || !song.album || !year) continue;
      lyrics.tags = lyrics.tags || {};
      lyrics.tags.ti = String(song.title);
      lyrics.tags.ar = String(song.artist);
      lyrics.tags.al = String(song.album);
      lyrics.tags.date = year;
      candidates.push(lyrics);
      origins.push(song);
      if (batch) {
        shareRomaji(request, candidates);
        if (!hasUnannotatedKanji(candidates[0])) break;
      }
    } catch (e) {
      Platform.log.warn("QQ", Platform.i18n.t("error.lyricsCandidate", String(song.title || song.id || ""), String(e && e.message ? e.message : e)));
    }
  }
  shareRomaji(request, candidates);
  if (!batch) return candidates;

  if (candidates.length && hasUnannotatedKanji(candidates[0])) {
    const wanted = Number(requestedSong.duration || 0);
    const donors = batchDonors.slice().sort(function(a, b) {
      return Math.abs(wanted - Number(a.duration || 0)) - Math.abs(wanted - Number(b.duration || 0));
    });
    const pool = candidates.slice();
    for (let i = 0; i < donors.length && i < 3; i++) {
      if (Date.now() - startedAt > budget) break;
      try {
        const donor = getLyricsForSong(request, donors[i]);
        if (donor && donor !== NOT_JAPANESE) pool.push(donor);
      } catch (e) {
        Platform.log.warn("QQ", String(e && e.message ? e.message : e));
      }
    }
    if (pool.length > candidates.length) shareRomaji(request, pool);
  }

  const confident = [];
  candidates.forEach(function(lyrics, index) {
    if (!confidentMatch(origins[index], requestedSong)) return;
    if (hasKanjiLine(lyrics) && !lyrics.original.some(hasRubyLine)) return;
    if (requestedSong.artist && origins[index].artist !== requestedSong.artist) lyrics.tags.ar = String(requestedSong.artist);
    confident.push(lyrics);
  });
  return confident.slice(0, 1);
}
