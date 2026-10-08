function mapSong(item, separator) {
  const singers = Array.isArray(item.Singers) ? item.Singers : [];
  const artist = singers.map(s => s.name || s.Name || "").filter(Boolean).join(separator || "/");
  const title = String(item.SongName || "");
  const album = String(item.AlbumName || "");
  const date = String(item.PublishDate || "");
  const coverUrl = normalizeImage(item.Image);
  const hash = String(item.FileHash || "");
  return {
    id: String(item.ID || ""),
    title: title,
    artist: artist,
    album: album,
    duration: Number(item.Duration || 0) * 1000,
    date: date,
    picUrl: coverUrl,
    fields: {
      title: title,
      artist: artist,
      album: album,
      date: date,
      cover_url: coverUrl,
      comment: String(item.Auxiliary || "")
    },
    internal: {
      hash: hash
    }
  };
}

function searchSongs(request) {
  const params = signParams({
    keyword: request.keyword || "",
    page: String(request.page || 1),
    pagesize: String(request.pageSize || 20)
  }, "", "Search");
  const url = "https://complexsearch.kugou.com/v2/search/song?" + buildQuery(params);
  const response = getJson(url, { "x-router": "complexsearch.kugou.com" });
  if (Number(response.error_code || 0) !== 0) return [];
  const list = response.data && Array.isArray(response.data.lists) ? response.data.lists : [];
  return list.map(item => mapSong(item, request.separator || "/"));
}

function lineTextOf(line) {
  return (Array.isArray(line[2]) ? line[2] : []).map(function(word) { return Array.isArray(word) ? String(word[2] || "") : ""; }).join("");
}

const NETEASE_TITLE_MARK = " (ncm)";

function isJapaneseLyrics(text) {
  const kana = (String(text || "").match(/[぀-ゟ゠-ヿ]/g) || []).length;
  const han = (String(text || "").match(/[一-鿿]/g) || []).length;
  return kana >= 10 && kana / (kana + han) >= 0.15;
}

function getLyricsForSong(request, song) {
  const internal = song.internal || {};
  const hash = internal.hash || "";
  if (!hash) return null;

  const searchParams = signParams({
    album_audio_id: song.id || "",
    duration: String(song.duration || 0),
    hash: hash,
    keyword: (song.artist || "") + " - " + (song.title || ""),
    lrctxt: "1",
    man: "no"
  }, "", "Lyric");
  const searchUrl = "https://lyrics.kugou.com/v1/search?" + buildQuery(searchParams);
  const searchResp = getJson(searchUrl, {});
  const candidate = searchResp.candidates && searchResp.candidates[0];
  if (!candidate) return null;

  const downloadParams = signParams({
    accesskey: candidate.accesskey,
    charset: "utf8",
    client: "mobi",
    fmt: "krc",
    id: candidate.id,
    ver: "1"
  }, "", "Lyric");
  const downloadUrl = "https://lyrics.kugou.com/download?" + buildQuery(downloadParams);
  const contentResp = getJson(downloadUrl, {});
  if (!contentResp || !contentResp.content) return null;

  const lyricText = Number(contentResp.contenttype || 0) === 2
    ? Platform.base64.decodeText(contentResp.content)
    : decryptKrc(contentResp.content);
  const parsed = parseKrc(lyricText);
  parsed.tags.ti = parsed.tags.ti || song.title || "";
  parsed.tags.ar = parsed.tags.ar || song.artist || "";
  parsed.tags.al = parsed.tags.al || song.album || "";

  const allText = parsed.original.map(function(line) {
    return (Array.isArray(line[2]) ? line[2] : []).map(function(word) { return Array.isArray(word) ? String(word[2] || "") : ""; }).join("");
  }).join("\n");
  if (!isJapaneseLyrics(allText)) return null;

  const kugouRomanization = parsed.romanization;
  const kugouWords = parsed.furiganaRomanizationWords || null;
  delete parsed.furiganaRomanizationWords;

  let annotated = parsed;
  try {
    if (typeof Furigana === "object" && Furigana && Furigana.annotateLyricsResult) {
      let found = null;
      if (/[一-鿿]/.test(allText)) {
        try {
          found = findNeteaseRomaji(parsed.original, song);
        } catch (e) {
          Platform.log.warn("Furigana", String(e && e.message ? e.message : e));
        }
      }

      let lineRomaji = kugouRomanization;
      let wordRomaji = kugouWords;
      if (found) {
        const kugouByStart = {};
        (Array.isArray(kugouRomanization) ? kugouRomanization : []).forEach(function(line) { kugouByStart[String(line[0])] = line; });
        lineRomaji = [];
        wordRomaji = kugouWords ? kugouWords.slice() : null;
        parsed.original.forEach(function(line, index) {
          if (found[index]) {
            lineRomaji.push([line[0], line[1], found[index]]);
            if (wordRomaji) wordRomaji[index] = null;
          } else if (kugouByStart[String(line[0])]) {
            lineRomaji.push(kugouByStart[String(line[0])]);
          }
        });
      }

      const firstPass = {};
      Object.keys(parsed).forEach(function(key) { firstPass[key] = parsed[key]; });
      firstPass.romanization = lineRomaji;
      const resultA = Furigana.annotateLyricsResult(firstPass, wordRomaji);

      let resultB = null;
      if (found && (kugouRomanization || kugouWords)) {
        const secondPass = {};
        Object.keys(parsed).forEach(function(key) { secondPass[key] = parsed[key]; });
        secondPass.romanization = kugouRomanization;
        resultB = Furigana.annotateLyricsResult(secondPass, kugouWords);
      }

      const hasRubyLine = function(line) {
        return Array.isArray(line) && Array.isArray(line[2]) && line[2].some(function(word) { return Array.isArray(word) && Array.isArray(word[3]) && word[3].length > 0; });
      };
      const counts = { netease: 0, kugou: 0, skipped: 0 };
      const merged = parsed.original.map(function(line, index) {
        if (resultA.original !== parsed.original && hasRubyLine(resultA.original[index])) {
          if (found && found[index]) counts.netease++; else counts.kugou++;
          return resultA.original[index];
        }
        if (resultB && resultB.original !== parsed.original && hasRubyLine(resultB.original[index])) { counts.kugou++; return resultB.original[index]; }
        if (/[一-鿿]/.test(lineTextOf(line))) counts.skipped++;
        return line;
      });

      if (merged.some(hasRubyLine)) {
        annotated = {};
        const base = resultA.original !== parsed.original ? resultA : resultB;
        Object.keys(base).forEach(function(key) { annotated[key] = base[key]; });
        annotated.original = merged;
        annotated.romanization = null;
        annotated.timing = "Word";
        annotated.language = "ja";
        Object.defineProperty(annotated, "furiganaNeteaseLines", { value: counts.netease, enumerable: false, writable: true, configurable: true });
        if (typeof FuriganaTtml === "object" && FuriganaTtml && FuriganaTtml.buildRubyTtml) {
          annotated.rawRubyTtml = FuriganaTtml.buildRubyTtml(annotated);
        }
      } else {
        annotated = resultA;
        annotated.romanization = kugouRomanization;
      }
    }
  } catch (e) {
    Platform.log.warn("Furigana", String(e && e.message ? e.message : e));
    annotated = parsed;
    annotated.romanization = kugouRomanization;
  }

  return annotated;
}

function getLyrics(request) {
  neStartBudget();
  const requestedSong = request.song || {};
  let songs = requestedSong.id && requestedSong.id !== "local-song"
    ? [requestedSong]
    : searchSongs({
        keyword: [requestedSong.title, requestedSong.artist].filter(Boolean).join(" "),
        page: request.page || 1,
        pageSize: request.pageSize || 5,
        separator: "/",
        config: request.config || {}
      });

  const seenSongs = {};
  songs = songs.filter(function(song) {
    const key = [song.title, song.artist, song.album, String(song.date || ((song.fields || {}).date) || ""), String(Math.round(Number(song.duration || 0) / 1000))].map(neNormalizeText).join("|");
    if (seenSongs[key]) return false;
    seenSongs[key] = true;
    return true;
  });

  return songs.map(function(song, index) {
    if (index > 0 && neCallTooLong()) return null;
    try {
      const lyrics = getLyricsForSong(request, song);
      const year = String(song.date || ((song.fields || {}).date) || "");
      if (!lyrics || !song.title || !song.artist || !song.album || !year) return null;
      lyrics.tags = lyrics.tags || {};
      lyrics.tags.ti = String(song.title) + (lyrics.furiganaNeteaseLines > 0 ? NETEASE_TITLE_MARK : "");
      lyrics.tags.ar = String(song.artist);
      lyrics.tags.al = String(song.album);
      lyrics.tags.date = year;
      return lyrics;
    } catch (e) {
      Platform.log.warn("KG", Platform.i18n.t("error.lyricsCandidate", String(song.title || song.id || ""), String(e && e.message ? e.message : e)));
      return null;
    }
  }).filter(Boolean);
}
