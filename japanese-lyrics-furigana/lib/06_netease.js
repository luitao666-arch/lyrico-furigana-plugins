const NE_SEARCH_URL = "https://music.163.com/api/cloudsearch/pc";
const NE_LYRIC_URL = "https://music.163.com/api/song/lyric";

function getNeteaseJson(url) {
  const text = Platform.http.getText(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://music.163.com/"
    }
  });
  return JSON.parse(text);
}

function searchNeteaseSongs(keyword) {
  const root = getNeteaseJson(NE_SEARCH_URL + "?type=1&offset=0&limit=10&s=" + encodeURIComponent(String(keyword || "")));
  const songs = ((root || {}).result || {}).songs;
  if (!Array.isArray(songs)) return [];
  return songs.map(function(song) {
    const artists = Array.isArray(song.ar) ? song.ar : [];
    return {
      id: String(song.id || ""),
      title: String(song.name || ""),
      artist: artists.map(function(artist) { return artist.name || ""; }).filter(Boolean).join("/"),
      duration: Number(song.dt || 0)
    };
  }).filter(function(song) { return song.id && song.title; });
}

// 逐字歌词（yrc）只有 eapi 接口返回；eapi 不可用时退回公开接口，只拿逐行歌词
function getNeteaseLyricTexts(id) {
  let root;
  try {
    root = eapiRequest("/eapi/song/lyric/v1", { id: Number(id), lv: "-1", tv: "-1", rv: "-1", yv: "-1" });
  } catch (e) {
    Platform.log.warn("NE", "EAPI lyric failed, use public API: " + String(e && e.message ? e.message : e));
    root = getNeteaseJson(NE_LYRIC_URL + "?lv=-1&tv=-1&rv=-1&id=" + encodeURIComponent(String(id)));
  }
  const text = function(key) { return String(((root || {})[key] || {}).lyric || ""); };
  return { yrc: text("yrc"), lrc: text("lrc"), trans: text("tlyric"), roma: text("romalrc") };
}

// 网易云的歌词常在日文字之间夹半角空格（「彷徨 う」「貴 方」），会打断读音对齐
const NE_JA_CHAR = "぀-ヿ一-鿿々";
const NE_STRAY_SPACE = new RegExp("([" + NE_JA_CHAR + "])[ \\t]+(?=[" + NE_JA_CHAR + "])", "g");

function cleanNeteaseText(text) {
  return String(text || "").replace(NE_STRAY_SPACE, "$1").trim();
}

// 逐字歌词里空格常挂在字的前后（「彷徨 」「う」），前后都是日文字时去掉
function cleanNeteaseWords(words) {
  const endsJa = new RegExp("[" + NE_JA_CHAR + "][ \\t]*$");
  const startsJa = new RegExp("^[ \\t]*[" + NE_JA_CHAR + "]");
  return words.map(function(word, index) {
    let text = String(word[2] || "").replace(NE_STRAY_SPACE, "$1");
    const prev = words[index - 1];
    const next = words[index + 1];
    if (next && endsJa.test(text) && startsJa.test(String(next[2] || ""))) text = text.replace(/[ \t]+$/, "");
    if (prev && startsJa.test(text) && endsJa.test(String(prev[2] || ""))) text = text.replace(/^[ \t]+/, "");
    return [word[0], word[1], text];
  }).filter(function(word) { return word[2] !== ""; });
}

// 解析参考 Replica0110/Lyrico-Plugins 网易云插件的 parseYrc；字里带括号时也能正确切分
function parseNeteaseYrc(text) {
  const lines = [];
  String(text || "").split(/\r?\n/).forEach(function(raw) {
    const match = raw.trim().match(/^\[(\d+),(\d+)](.*)$/);
    if (!match) return;
    const start = Number(match[1]);
    const words = [];
    const wordRe = /\((\d+),(\d+),-?\d+\)((?:(?!\(\d+,\d+,-?\d+\))[\s\S])*)/g;
    let word;
    while ((word = wordRe.exec(match[3])) !== null) {
      if (word[3]) words.push([Number(word[1]), Number(word[1]) + Number(word[2]), word[3]]);
    }
    const cleaned = cleanNeteaseWords(words.sort(function(a, b) { return a[0] - b[0]; }));
    if (cleaned.some(function(w) { return w[2].trim(); })) lines.push([start, start + Number(match[2]), cleaned]);
  });
  return lines.sort(function(a, b) { return a[0] - b[0]; });
}

// 返回 [start, text]，按时间排序；跳过 JSON 署名行和空行
function parseNeteaseLrc(text) {
  const lines = [];
  String(text || "").split(/\r?\n/).forEach(function(raw) {
    const line = raw.trim();
    if (!line || line.charAt(0) === "{") return;
    const timeRe = /\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?]/g;
    const starts = [];
    let end = 0;
    let match;
    while ((match = timeRe.exec(line)) !== null && match.index === end) {
      starts.push((Number(match[1]) * 60 + Number(match[2])) * 1000 + Number((match[3] || "0").padEnd(3, "0")));
      end = timeRe.lastIndex;
    }
    const content = cleanNeteaseText(line.slice(end));
    if (!starts.length || !content) return;
    starts.forEach(function(start) { lines.push([start, content]); });
  });
  return lines.sort(function(a, b) { return a[0] - b[0]; });
}

// 行结束取下一行开始，但不超过按字数估算的演唱时长，避免整段间奏都停在上一行
function neteaseTimedLines(parsed) {
  return parsed.map(function(line, index) {
    const sungMs = Math.min(20000, Math.max(8000, line[1].replace(/\s+/g, "").length * 1000));
    const next = parsed[index + 1];
    const end = Math.max(line[0], Math.min(next ? next[0] - 10 : Infinity, line[0] + sungMs));
    return [line[0], end, [[line[0], end, line[1]]]];
  });
}
