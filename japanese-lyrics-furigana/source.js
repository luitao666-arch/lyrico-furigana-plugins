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
    fields: { title: title, artist: artist, album: albumName, date: date }
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
  if (!isJapaneseLyrics(original.map(lineTextOf).join("\n"))) return null;

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

function selectCandidates(songs, query) {
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
    return spans.some(function(span) { return span.length >= 2 && (artist.indexOf(span) >= 0 || span.indexOf(artist) >= 0); }) ? 0 : 1;
  };
  const anchors = songs.filter(function(song) { return titleRank(song) < 9; });
  if (!anchors.length) return songs;
  const sameWork = function(song) {
    return anchors.some(function(other) {
      return normalizeLine(other.artist).key === normalizeLine(song.artist).key &&
        Math.abs(Number(other.duration || 0) - Number(song.duration || 0)) <= 1000;
    });
  };
  return songs
    .map(function(song, index) { return { song: song, index: index, rank: Math.min(titleRank(song), sameWork(song) ? 3 : 9) + artistRank(song) }; })
    .filter(function(item) { return item.rank < 9; })
    .sort(function(x, y) { return x.rank - y.rank || x.index - y.index; })
    .map(function(item) { return item.song; });
}

function searchCandidates(request, requestedSong) {
  const title = String(requestedSong.title || "");
  const artist = String(requestedSong.artist || "");
  const query = [title, artist].filter(Boolean).join(" ");
  const keywords = [query];
  if (title && artist) keywords.push(title);
  const found = [];
  const seen = {};
  keywords.forEach(function(keyword, index) {
    let list = [];
    try {
      list = searchSongs({ keyword: keyword, page: request.page || 1, pageSize: request.pageSize || 5, separator: "/", config: request.config || {} });
    } catch (e) {
      if (index === 0) throw e;
    }
    list.forEach(function(song) {
      if (seen[song.id]) return;
      seen[song.id] = true;
      found.push(song);
    });
  });
  return selectCandidates(found, query).slice(0, MAX_CANDIDATES);
}

function getLyrics(request) {
  const startedAt = Date.now();
  const requestedSong = request.song || {};
  let songs = requestedSong.id && requestedSong.id !== "local-song"
    ? [requestedSong]
    : searchCandidates(request, requestedSong);

  const seenSongs = {};
  songs = songs.filter(function(song) {
    const key = [song.title, song.artist, song.album, String(song.date || ((song.fields || {}).date) || ""), String(Math.round(Number(song.duration || 0) / 1000))].join("|").toLowerCase();
    if (seenSongs[key]) return false;
    seenSongs[key] = true;
    return true;
  });

  const candidates = [];
  songs.forEach(function(song) {
    if (candidates.length && Date.now() - startedAt > TIME_BUDGET_MS) return;
    try {
      const lyrics = getLyricsForSong(request, song);
      const year = String(song.date || ((song.fields || {}).date) || "");
      if (!lyrics || !song.title || !song.artist || !song.album || !year) return;
      lyrics.tags = lyrics.tags || {};
      lyrics.tags.ti = String(song.title);
      lyrics.tags.ar = String(song.artist);
      lyrics.tags.al = String(song.album);
      lyrics.tags.date = year;
      candidates.push(lyrics);
    } catch (e) {
      Platform.log.warn("QQ", Platform.i18n.t("error.lyricsCandidate", String(song.title || song.id || ""), String(e && e.message ? e.message : e)));
    }
  });
  shareRomaji(request, candidates);
  return candidates;
}
