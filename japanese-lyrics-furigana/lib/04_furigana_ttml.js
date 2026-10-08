// 日语歌词振假名（Furigana）：读音取自平台罗马音，与原文假名对齐后挂到汉字上。
// 只新增 Ruby 注音层（word[3]），原文、逐字时间、行时间、翻译都不改；对不上就跳过。
var Furigana = (function() {
  const KANA_RE = /[ぁ-んァ-ン]/;
  const KANA_CHAR_RE = /[ぁ-ゖァ-ヶ]/;
  const KANJI_RE = /[㐀-䶿一-鿿豈-﫿々〆ヵヶ]/;
  const SMALL_KANA = "ゃゅょぁぃぅぇぉゎ";
  const LONG_VOWEL_KANA = "あいうえおー";
  const KANA_ALTS = {
    "は": ["は", "わ"],
    "へ": ["へ", "え"],
    "を": ["を", "お"],
    "づ": ["づ", "ず"],
    "ぢ": ["ぢ", "じ"],
    "う": ["う", "お"],
    "い": ["い", "え"],
    "ゐ": ["ゐ", "い", "うぃ"],
    "ゑ": ["ゑ", "え", "うぇ"],
    "ゔ": ["ゔ", "ぶ"],
    "ぁ": ["ぁ", "あ"],
    "ぃ": ["ぃ", "い"],
    "ぅ": ["ぅ", "う"],
    "ぇ": ["ぇ", "え"],
    "ぉ": ["ぉ", "お"]
  };

  function kataToHira(text) {
    return String(text || "").replace(/[ァ-ヶ]/g, function(ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
  }

  function hasKanji(text) {
    return KANJI_RE.test(String(text || ""));
  }

  function isKanji(ch) {
    return KANJI_RE.test(ch);
  }

  const DIGIT_RE = /[0-9０-９]/;
  const MARK_NEIGHBOR_RE = /[A-Za-z×＊*#＃]/;

  const INLINE_READING_RE = /^[(（]\s*[ぁ-ゖァ-ヶー]+(?:\s+[ぁ-ゖァ-ヶー]+)*\s*[)）]/;

  const SIMPLIFIED_ONLY = "们这说对么给见织时间长门问开关过话语书买卖车东电马鸟鱼乐爱华员头汉红绿蓝让谁请谢认识读课调谈论诉该详试诗误乡习协单卫压历县变动务发胜办为专兴养兽军农";
  const SIMPLIFIED_ONLY_RE = new RegExp("[" + SIMPLIFIED_ONLY + "]");
  const DIGIT_READINGS = {
    "0": ["れい", "ぜろ", "まる", "れ"],
    "1": ["いち", "ひと", "いっ", "いつ", "ひ", "い"],
    "2": ["に", "ふた", "ふ", "にっ"],
    "3": ["さん", "み", "みっ", "さ", "ざん"],
    "4": ["よん", "よ", "し", "よっ"],
    "5": ["ご", "いつ", "いっ"],
    "6": ["ろく", "む", "ろっ", "むっ", "ろ"],
    "7": ["なな", "しち", "なの", "な", "し"],
    "8": ["はち", "や", "はっ", "やっ"],
    "9": ["きゅう", "く", "ここの", "きゅ", "こ"]
  };

  function isProbablyJapanese(text) {
    return KANA_RE.test(String(text || ""));
  }

  function hasJapaneseText(text) {
    return KANA_RE.test(String(text || "")) || hasKanji(text);
  }

  // 罗马音转假名
  function romajiToKana(text, strict) {
    if (typeof RomajiKana !== "object" || !RomajiKana) return null;
    return RomajiKana.toHiragana(text, strict);
  }

  // 原文切 token
  function parenRanges(whole) {
    const ranges = [];
    const re = /[(（][^()（）]*[)）]/g;
    let m;
    while ((m = re.exec(whole)) !== null) {
      if (/[ぁ-ゖァ-ヶ一-鿿]/.test(m[0])) ranges.push([m.index, m.index + m[0].length]);
    }
    return ranges;
  }

  function buildTokens(texts, ignoreDigits, ignoreParens) {
    const tokens = [];
    const whole = texts.map(function(text) { return String(text || ""); }).join("");
    let offset = 0;
    let skipUntil = 0;
    const skipRanges = ignoreParens ? parenRanges(whole) : [];
    function inSkipRange(g) {
      for (let r = 0; r < skipRanges.length; r++) if (g >= skipRanges[r][0] && g < skipRanges[r][1]) return true;
      return false;
    }
    texts.forEach(function(text, wordIndex) {
      const value = String(text || "");
      const base = offset;
      offset += value.length;
      let i = 0;
      while (i < value.length) {
        if (base + i < skipUntil || inSkipRange(base + i)) { i++; continue; }
        const ch = value.charAt(i);
        if (isKanji(ch)) {
          let j = i + 1;
          while (j < value.length && isKanji(value.charAt(j))) j++;
          const inline = INLINE_READING_RE.exec(whole.slice(base + j));
          const token = { kind: "kanji", word: wordIndex, start: i, end: j, inline: !!inline };
          if (inline) token.inlineReading = kataToHira(inline[0].replace(/[\s()（）]/g, ""));
          if (inline) {
            const previous = tokens.length ? tokens[tokens.length - 1] : null;
            if (previous && previous.digit && previous.word === wordIndex && previous.end === i) previous.inline = true;
          }
          tokens.push(token);
          if (inline) {
            skipUntil = base + j + inline[0].length;
            let ci = tokens.length - 1;
            while (ci > 0) {
              const a = tokens[ci - 1];
              const b = tokens[ci];
              if (a.kind === "kanji" && !a.digit && b.word === a.word + 1 && b.start === 0 && a.end === String(texts[a.word] || "").length) {
                a.inline = true;
                a.inlineReading = undefined;
                b.inlineReading = undefined;
                ci--;
              } else break;
            }
          }
          i = j;
          continue;
        }
        if (DIGIT_RE.test(ch)) {
          let j = i + 1;
          while (j < value.length && DIGIT_RE.test(value.charAt(j))) j++;
          const isMark = ignoreDigits ||
            (i > 0 && MARK_NEIGHBOR_RE.test(value.charAt(i - 1))) ||
            (j < value.length && MARK_NEIGHBOR_RE.test(value.charAt(j)));
          if (!isMark) tokens.push({ kind: "kanji", digit: true, word: wordIndex, start: i, end: j });
          i = j;
          continue;
        }
        if (KANA_CHAR_RE.test(ch) && (whole.charAt(base + i + 1) === "\u3099" || whole.charAt(base + i + 1) === "\u309A")) {
          let composed = ch + whole.charAt(base + i + 1);
          try { composed = composed.normalize("NFC"); } catch (e) {}
          const hc = kataToHira(composed.charAt(0));
          tokens.push({ kind: "kana", word: wordIndex, start: i, end: i + 1, alts: KANA_ALTS[hc] || [hc] });
          skipUntil = Math.max(skipUntil, base + i + 2);
          i++;
          continue;
        }
        if (ch >= "ｦ" && ch <= "ﾝ") {
          let sequence = ch;
          let advance = 1;
          const mark = whole.charAt(base + i + 1);
          if (mark === "ﾞ" || mark === "ﾟ") { sequence += mark; skipUntil = Math.max(skipUntil, base + i + 2); }
          let full = sequence;
          try { full = sequence.normalize("NFKC"); } catch (e) {}
          const h = kataToHira(full.charAt(0));
          if (h === "っ") tokens.push({ kind: "sokuon", word: wordIndex, start: i, end: i + advance });
          else tokens.push({ kind: "kana", word: wordIndex, start: i, end: i + advance, alts: KANA_ALTS[h] || [h] });
          i += advance;
          continue;
        }
        if (ch === "ー" || ch === "ｰ") {
          tokens.push({ kind: "long", word: wordIndex, start: i, end: i + 1 });
        } else if (KANA_CHAR_RE.test(ch)) {
          const h = kataToHira(ch);
          if (h === "っ") {
            tokens.push({ kind: "sokuon", word: wordIndex, start: i, end: i + 1 });
          } else {
            tokens.push({ kind: "kana", word: wordIndex, start: i, end: i + 1, alts: KANA_ALTS[h] || [h] });
          }
        }
        i++;
      }
    });
    return tokens;
  }

  // 对齐
  function solve(tokens, reading, preferLong, strictSokuon, fixed) {
    const n = tokens.length;
    const m = reading.length;
    const dead = {};
    const caps = new Array(n);
    const starts = new Array(n + 1);

    function captureCanEndAt(pos) {
      return pos >= m || SMALL_KANA.indexOf(reading.charAt(pos)) < 0;
    }

    function captureCanStartAt(pos) {
      const ch = reading.charAt(pos);
      return !!ch && SMALL_KANA.indexOf(ch) < 0 && ch !== "ん" && ch !== "っ" && ch !== "ー";
    }

    function go(ti, ri) {
      if (ti === n) { if (ri === m) { starts[n] = ri; return true; } return false; }
      const key = ti * (m + 1) + ri;
      if (dead[key]) return false;

      const token = tokens[ti];
      let ok = false;

      if (token.kind === "kana") {
        for (let a = 0; a < token.alts.length && !ok; a++) {
          const alt = token.alts[a];
          if (reading.substr(ri, alt.length) === alt && go(ti + 1, ri + alt.length)) ok = true;
        }
      } else if (token.kind === "long") {
        if (ri < m && LONG_VOWEL_KANA.indexOf(reading.charAt(ri)) >= 0 && go(ti + 1, ri + 1)) ok = true;
        else if (go(ti + 1, ri)) ok = true;
      } else if (token.kind === "sokuon") {
        if ((reading.charAt(ri) === "っ" || (reading.charAt(ri) === "つ" && ri === m - 1)) && go(ti + 1, ri + 1)) ok = true;
        else if (!strictSokuon && go(ti + 1, ri)) ok = true;
      } else if (fixed && fixed[ti] !== undefined) {
        const cap = fixed[ti];
        if (reading.substr(ri, cap.length) === cap && go(ti + 1, ri + cap.length)) { caps[ti] = cap; ok = true; }
      } else if (captureCanStartAt(ri)) {
        const length = token.end - token.start;
        const min = length;
        const max = Math.min(m - ri, length * 5);
        if (preferLong) {
          for (let k = max; k >= min && !ok; k--) {
            if (captureCanEndAt(ri + k) && go(ti + 1, ri + k)) { caps[ti] = reading.substr(ri, k); ok = true; }
          }
        } else {
          for (let k = min; k <= max && !ok; k++) {
            if (captureCanEndAt(ri + k) && go(ti + 1, ri + k)) { caps[ti] = reading.substr(ri, k); ok = true; }
          }
        }
      }

      if (!ok) dead[key] = 1;
      else starts[ti] = ri;
      return ok;
    }

    const solved = go(0, 0);
    if (solved) caps.starts = starts;
    return solved ? caps : null;
  }

  // 读音表
  const KANJI_READINGS = (function() {
    const table = {};
    const raw = typeof FURIGANA_KANJI_READINGS_RAW === "string" ? FURIGANA_KANJI_READINGS_RAW : "";
    raw.split(";").forEach(function(item) {
      const i = item.indexOf(":");
      if (i > 0) table[item.slice(0, i)] = item.slice(i + 1).split("|");
    });
    return table;
  })();

  const VOICED = {
    "か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご",
    "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ",
    "た": "だ", "ち": "ぢ", "つ": "づ", "て": "で", "と": "ど",
    "は": "ば", "ひ": "び", "ふ": "ぶ", "へ": "べ", "ほ": "ぼ"
  };
  const SEMI_VOICED = { "は": "ぱ", "ひ": "ぴ", "ふ": "ぷ", "へ": "ぺ", "ほ": "ぽ" };

  const NOUN_ENDINGS = ["り", "し", "み", "い", "び", "き", "ぎ", "ち", "に", "ひ"];

  function readingVariants(r, allowEnding) {
    const out = [r];
    const head = r.charAt(0);
    const tail = r.slice(1);
    if (VOICED[head]) out.push(VOICED[head] + tail);
    if (head === "ち") out.push("じ" + tail);
    if (head === "つ") out.push("ず" + tail);
    if (SEMI_VOICED[head]) out.push(SEMI_VOICED[head] + tail);
    const last = r.charAt(r.length - 1);
    if (r.length > 1 && "つちくき".indexOf(last) >= 0) {
      out.slice().forEach(function(v) { out.push(v.slice(0, -1) + "っ"); });
    }
    if (allowEnding !== false) {
      out.slice().forEach(function(v) {
        NOUN_ENDINGS.forEach(function(ending) { out.push(v + ending); });
      });
      for (let len = 1; len < r.length; len++) out.push(r.slice(0, len));
    }
    return out;
  }

  function expandRepeat(base) {
    return base.replace(/(.)々/g, "$1$1");
  }

  function baseKnown(base) {
    if (DIGIT_RE.test(base.charAt(0))) return true;
    base = expandRepeat(base);
    for (let i = 0; i < base.length; i++) if (!KANJI_READINGS[base.charAt(i)]) return false;
    return base.length > 0;
  }

  function kanjiReadingMatches(base, part, allowEnding) {
    if (base.length === 0) return false;
    if (base.indexOf("々") > 0) base = expandRepeat(base);
    if (DIGIT_RE.test(base.charAt(0))) {
      if (base.length > 1) return true;
      const digit = String.fromCharCode(base.charCodeAt(0) >= 0xFF10 ? base.charCodeAt(0) - 0xFF10 + 48 : base.charCodeAt(0));
      return (DIGIT_READINGS[digit] || []).indexOf(part) >= 0;
    }
    if (base.length > 1) return multiKanjiReadingMatches(base, part, allowEnding);
    const list = KANJI_READINGS[base];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const variants = readingVariants(list[i], allowEnding);
      if (variants.indexOf(part) >= 0) return true;
    }
    return false;
  }

  function multiKanjiReadingMatches(base, part, allowEnding) {
    const memo = {};
    function rec(ci, pos) {
      if (ci === base.length) return pos === part.length;
      const key = ci + ":" + pos;
      if (key in memo) return memo[key];
      let ok = false;
      for (let k = 1; !ok && pos + k <= part.length && k <= 5; k++) {
        if (!isValidCapture(part, pos, pos + k)) continue;
        if (kanjiReadingMatches(base.charAt(ci), part.substr(pos, k), allowEnding !== false && ci === base.length - 1)) ok = rec(ci + 1, pos + k);
      }
      memo[key] = ok;
      return ok;
    }
    return rec(0, 0);
  }

  function hintAllowed(base, hint) {
    for (let i = 0; i < base.length; i++) {
      if (!KANJI_READINGS[base.charAt(i)]) return true;
    }
    return kanjiReadingMatches(base, hint);
  }

  function isValidCapture(reading, from, to) {
    const startCh = reading.charAt(from);
    if (!startCh || SMALL_KANA.indexOf(startCh) >= 0 || startCh === "ん" || startCh === "っ" || startCh === "ー") return false;
    return to >= reading.length || SMALL_KANA.indexOf(reading.charAt(to)) < 0;
  }

  function enumerateSplits(groupTokens, combined) {
    const results = [];
    const parts = [];
    function rec(gi, pos) {
      if (results.length > 200) return;
      if (gi === groupTokens.length) {
        if (pos === combined.length) results.push(parts.slice());
        return;
      }
      const length = groupTokens[gi].end - groupTokens[gi].start;
      for (let k = length; k <= length * 5 && pos + k <= combined.length; k++) {
        if (!isValidCapture(combined, pos, pos + k)) continue;
        parts.push(combined.substr(pos, k));
        rec(gi + 1, pos + k);
        parts.pop();
      }
    }
    rec(0, 0);
    return results;
  }

  function alignTokens(tokens, reading, baseTexts, hints) {
    if (!reading) return { ok: false, readings: {} };
    let strict = true;
    let shortCaps = solve(tokens, reading, false, true);
    if (!shortCaps) { strict = false; shortCaps = solve(tokens, reading, false, false); }
    if (!shortCaps) return { ok: false, readings: {} };
    let longCaps = solve(tokens, reading, true, strict) || shortCaps;
    hints = hints || {};

    const fixedInline = {};
    tokens.forEach(function(token, ti) { if (token.inline && token.inlineReading) fixedInline[ti] = token.inlineReading; });
    if (Object.keys(fixedInline).length) {
      const withFixed = solve(tokens, reading, false, strict, fixedInline);
      if (withFixed) {
        shortCaps = withFixed;
        longCaps = solve(tokens, reading, true, strict, fixedInline) || withFixed;
      }
    }

    const readings = {};
    let mergeable = [];
    const allGroups = [];
    let index = 0;
    while (index < tokens.length) {
      if (tokens[index].kind !== "kanji") { index++; continue; }
      if (tokens[index].inline) { readings[index] = shortCaps[index] || ""; index++; continue; }
      let endIndex = index + 1;
      while (endIndex < tokens.length && tokens[endIndex].kind === "kanji" && !tokens[endIndex].inline) endIndex++;

      const group = [];
      for (let i = index; i < endIndex; i++) group.push(i);
      allGroups.push(group);
      const sure = group.length === 1 && shortCaps[index] && shortCaps[index] === longCaps[index];

      handleGroup(group);
      index = endIndex;
    }

    function handleGroup(group) {
      const sure = group.length === 1 && shortCaps[group[0]] && shortCaps[group[0]] === longCaps[group[0]];
      if (sure) {
        group.forEach(function(ti) { readings[ti] = shortCaps[ti]; });
      } else {
        resolveGroup(group);
      }
    }

    for (let round = 0; round < 3; round++) {
      const pending = allGroups.filter(function(group) { return readings[group[0]] === undefined; });
      if (!pending.length || !Object.keys(readings).length) break;
      const shortFixed = solve(tokens, reading, false, strict, readings);
      if (!shortFixed) break;
      shortCaps = shortFixed;
      longCaps = solve(tokens, reading, true, strict, readings) || shortFixed;
      mergeable = [];
      let progressed = false;
      pending.forEach(function(group) {
        handleGroup(group);
        if (readings[group[0]] !== undefined) progressed = true;
      });
      if (!progressed) break;
    }
    mergeable = mergeable.filter(function(group) { return readings[group[0]] === undefined; });
    const unresolved = allGroups.filter(function(group) { return readings[group[0]] === undefined; });

    function baseOf(ti) {
      const token = tokens[ti];
      return String(baseTexts[token.word] || "").slice(token.start, token.end);
    }

    function resolveGroup(group) {
      const groupTokens = group.map(function(ti) { return tokens[ti]; });
      const combos = [];
      [shortCaps, longCaps].forEach(function(caps) {
        const combined = group.map(function(ti) { return caps[ti] || ""; }).join("");
        if (combined && combos.indexOf(combined) < 0) combos.push(combined);
      });

      const hinted = group.map(function(ti) { return hints[ti] || ""; });
      const hintsFit = hinted.some(Boolean) && combos.indexOf(hinted.join("")) >= 0;
      const hintsValid = hintsFit && group.every(function(ti, gi) {
        return !hinted[gi] || hintAllowed(baseOf(ti), hinted[gi]);
      });
      if (hintsValid) {
        group.forEach(function(ti, gi) { if (hinted[gi]) readings[ti] = hinted[gi]; });
        return;
      }

      const candidates = [];
      const seenSplits = {};
      const unknownCount = group.filter(function(ti) { return !baseKnown(baseOf(ti)); }).length;
      combos.forEach(function(combined) {
        enumerateSplits(groupTokens, combined).forEach(function(parts) {
          let cost = 0;
          const bases = parts.map(function(part, gi) { return baseOf(group[gi]); });
          const invalid = [];
          parts.forEach(function(part, gi) {
            const base = bases[gi];
            if (unknownCount === 1 && !baseKnown(base)) return;
            if (kanjiReadingMatches(base, part, false)) return;
            if (kanjiReadingMatches(base, part, true)) { cost++; return; }
            invalid.push(gi);
          });
          let allKnown = invalid.length === 0;
          if (!allKnown && invalid.length === 1 && group.length >= 2) {
            const freeBase = bases[invalid[0]];
            const othersChars = bases.reduce(function(sum, b, gi) { return gi === invalid[0] ? sum : sum + expandRepeat(b).length; }, 0);
            if (!DIGIT_RE.test(freeBase.charAt(0)) && (freeBase.length >= 2 || othersChars >= 2)) { allKnown = true; cost += 10; }
          }
          if (!allKnown) return;
          const key = parts.join("|");
          if (seenSplits[key]) return;
          seenSplits[key] = true;
          candidates.push({ parts: parts, cost: cost });
        });
      });
      let minCost = Infinity;
      candidates.forEach(function(c) { if (c.cost < minCost) minCost = c.cost; });
      const cheapest = candidates.filter(function(c) { return c.cost === minCost; });
      if (cheapest.length === 1) {
        group.forEach(function(ti, gi) { readings[ti] = cheapest[0].parts[gi]; });
        return;
      }

      if (hintsFit) {
        group.forEach(function(ti, gi) { if (hinted[gi]) readings[ti] = hinted[gi]; });
        return;
      }

      if (group.length >= 2 && combos.length === 1 && groupContiguous(group)) mergeable.push(group.slice());
    }

    function groupContiguous(group) {
      for (let k = 0; k < group.length; k++) {
        const a = tokens[group[k]];
        if (a.digit || a.inline) return false;
        if (k + 1 < group.length) {
          const b = tokens[group[k + 1]];
          if (b.digit || b.inline) return false;
          if (b.word !== a.word + 1 || a.end !== String(baseTexts[a.word] || "").length || b.start !== 0) return false;
        }
      }
      return true;
    }

    return { ok: true, readings: readings, mergeable: mergeable, unresolved: unresolved };
  }

  // word 切分与计时
  function cloneWord(word) {
    return Array.isArray(word) ? word.slice() : word;
  }

  function wordHasRuby(word) {
    return Array.isArray(word) && Array.isArray(word[3]) && word[3].length > 0;
  }

  function segmentsToWords(word, segments) {
    const annotated = segments.some(function(segment) { return !!segment.reading; });
    if (!annotated) return [cloneWord(word)];

    const start = Number(word[0] || 0);
    const end = Number(word[1] || start);
    const text = String(word[2] || "");
    const totalChars = Math.max(1, text.length);
    const duration = Math.max(0, end - start);
    let elapsedChars = 0;

    return segments.map(function(segment, index) {
      const segmentStart = index === 0
        ? start
        : Math.round(start + duration * elapsedChars / totalChars);
      elapsedChars += segment.text.length;
      const segmentEnd = index === segments.length - 1
        ? end
        : Math.round(start + duration * elapsedChars / totalChars);

      if (!segment.reading) return [segmentStart, segmentEnd, segment.text];
      return [segmentStart, segmentEnd, segment.text, [[null, null, segment.reading]]];
    });
  }

  function segmentsFromAlignment(text, wordTokens) {
    const segments = [];
    let cursor = 0;

    function pushPlain(value) {
      if (!value) return;
      const previous = segments.length ? segments[segments.length - 1] : null;
      if (previous && !previous.reading) previous.text += value;
      else segments.push({ text: value, reading: "" });
    }

    wordTokens.forEach(function(item) {
      if (!item.reading) return;
      pushPlain(text.slice(cursor, item.token.start));
      segments.push({ text: text.slice(item.token.start, item.token.end), reading: item.reading });
      cursor = item.token.end;
    });
    pushPlain(text.slice(cursor));
    return segments;
  }

  function wordRomajiMapping(words, romaWords) {
    if (!Array.isArray(romaWords) || !romaWords.length) return null;

    let mapping = null;
    if (romaWords.length === words.length) {
      mapping = words.map(function(_, index) { return index; });
    } else {
      const nonEmpty = [];
      words.forEach(function(word, index) {
        if (Array.isArray(word) && String(word[2] || "").trim()) nonEmpty.push(index);
      });
      if (romaWords.length !== nonEmpty.length) return null;
      mapping = new Array(words.length);
      nonEmpty.forEach(function(wordIndex, romaIndex) { mapping[wordIndex] = romaIndex; });
    }

    const romaFor = function(index) {
      const romaIndex = mapping[index];
      return romaIndex == null ? "" : String(romaWords[romaIndex] || "");
    };

    let checked = 0;
    for (let i = 0; i < words.length; i++) {
      const text = Array.isArray(words[i]) ? String(words[i][2] || "") : "";
      if (!text.trim() || hasKanji(text) || !KANA_RE.test(text)) continue;
      const reading = romajiToKana(romaFor(i), true);
      if (reading == null || !solve(buildTokens([text]), reading, false)) return null;
      checked++;
    }
    if (!checked && romaWords.length !== words.length) return null;
    return romaFor;
  }

  function wordRomajiHints(texts, romaFor, ignoreDigits) {
    const hints = {};
    if (!romaFor) return hints;
    let offset = 0;
    texts.forEach(function(text, wordIndex) {
      const wordTokens = buildTokens([text], ignoreDigits);
      if (hasKanji(text)) {
        const reading = romajiToKana(romaFor(wordIndex), true);
        if (reading) {
          const a = solve(wordTokens, reading, false);
          const b = solve(wordTokens, reading, true);
          if (a && b) {
            wordTokens.forEach(function(token, ti) {
              if (token.kind === "kanji" && a[ti] && a[ti] === b[ti]) hints[offset + ti] = a[ti];
            });
          }
        }
      }
      offset += wordTokens.length;
    });
    return hints;
  }

  // 行级处理
  function digitsUnresolved(tokens, aligned) {
    return tokens.some(function(token, index) {
      return token.digit && !token.inline && !(aligned.readings && aligned.readings[index]);
    });
  }

  function alignWordTokens(text, reading) {
    let tokens = buildTokens([text], false);
    let aligned = reading ? alignTokens(tokens, reading, [text]) : { ok: false, readings: {} };
    if (reading && tokens.some(function(token) { return token.digit; }) &&
        (!aligned.ok || digitsUnresolved(tokens, aligned))) {
      const retryTokens = buildTokens([text], true);
      const retry = alignTokens(retryTokens, reading, [text]);
      if (retry.ok) { tokens = retryTokens; aligned = retry; }
    }
    return { tokens: tokens, aligned: aligned };
  }

  function annotateByWordRomaji(words, romaWords) {
    const romaFor = wordRomajiMapping(words, romaWords);
    if (!romaFor) return null;

    let anyKanji = false;
    const out = [];
    words.forEach(function(word, index) {
      if (!Array.isArray(word) || wordHasRuby(word) || !hasKanji(word[2])) {
        out.push([cloneWord(word)]);
        return;
      }
      anyKanji = true;
      const text = String(word[2] || "");
      const reading = romajiToKana(romaFor(index), true);
      const attempt = alignWordTokens(text, reading);
      const tokens = attempt.tokens;
      const aligned = attempt.aligned;
      if (!aligned.ok) {
        out.push(null);
        return;
      }
      const wordTokens = tokens.map(function(token, ti) {
        return { token: token, reading: token.inline ? "" : (aligned.readings[ti] || "") };
      });
      out.push(segmentsToWords(word, segmentsFromAlignment(text, wordTokens)));
    });

    return anyKanji ? out : null;
  }

  function copyEchoReadings(texts, whole, ranges, tokens, aligned, perWord) {
    const bases = [];
    let acc = 0;
    texts.forEach(function(text) { bases.push(acc); acc += text.length; });
    function wordOf(g) {
      for (let w = texts.length - 1; w >= 0; w--) if (g >= bases[w]) return w;
      return 0;
    }
    const mainByStart = {};
    tokens.forEach(function(token, index) {
      if (token.kind !== "kanji" || token.inline || !aligned.readings[index]) return;
      mainByStart[bases[token.word] + token.start] = { end: bases[token.word] + token.end, reading: aligned.readings[index] };
    });

    ranges.forEach(function(range) {
      const inner = whole.slice(range[0] + 1, range[1] - 1);
      const source = whole.indexOf(inner);
      if (!inner || source < 0 || source + inner.length > range[0]) return;
      const runRe = /[一-鿿々]+/g;
      let m;
      while ((m = runRe.exec(inner)) !== null) {
        let pos = m.index;
        const runEnd = m.index + m[0].length;
        while (pos < runEnd) {
          const g = range[0] + 1 + pos;
          const w = wordOf(g);
          const pieceEnd = Math.min(runEnd, pos + (bases[w] + texts[w].length - g));
          const from = source + pos;
          const to = source + pieceEnd;
          let cursor = from;
          let copied = "";
          while (cursor < to && mainByStart[cursor]) { copied += mainByStart[cursor].reading; cursor = mainByStart[cursor].end; }
          if (cursor === to && copied) {
            perWord[w].push({ token: { kind: "kanji", word: w, start: g - bases[w], end: g - bases[w] + (pieceEnd - pos) }, reading: copied });
          }
          pos = pieceEnd;
        }
      }
    });
    perWord.forEach(function(list) { list.sort(function(a, b) { return a.token.start - b.token.start; }); });
  }

  function annotateByLineReading(words, reading, romaWords) {
    if (!reading) return null;
    const texts = words.map(function(word) { return Array.isArray(word) ? String(word[2] || "") : ""; });
    const mapping = wordRomajiMapping(words, romaWords);
    function alignLineTokens(ignoreDigits, ignoreParens) {
      const lineTokens = buildTokens(texts, ignoreDigits, ignoreParens);
      if (!lineTokens.some(function(token) { return token.kind === "kanji"; })) return null;
      const lineHints = wordRomajiHints(texts, mapping, ignoreDigits);
      return { tokens: lineTokens, aligned: alignTokens(lineTokens, reading, texts, lineHints) };
    }

    let attempt = alignLineTokens(false);
    if (attempt && attempt.tokens.some(function(token) { return token.digit; }) &&
        (!attempt.aligned.ok || digitsUnresolved(attempt.tokens, attempt.aligned))) {
      const retry = alignLineTokens(true);
      if (retry && retry.aligned.ok) attempt = retry;
    }
    const whole = texts.join("");
    const ranges = parenRanges(whole);
    let parensIgnored = false;
    if ((!attempt || !attempt.aligned.ok) && ranges.length) {
      attempt = alignLineTokens(false, true);
      if (!attempt || !attempt.aligned.ok) attempt = alignLineTokens(true, true);
      parensIgnored = true;
    }
    if (!attempt || !attempt.aligned.ok) return null;
    const tokens = attempt.tokens;
    const aligned = attempt.aligned;

    const perWord = texts.map(function() { return []; });
    tokens.forEach(function(token, index) {
      if (token.kind !== "kanji") return;
      perWord[token.word].push({ token: token, reading: token.inline ? "" : (aligned.readings[index] || "") });
    });

    if (parensIgnored) copyEchoReadings(texts, whole, ranges, tokens, aligned, perWord);

    return words.map(function(word, index) {
      if (!Array.isArray(word) || wordHasRuby(word) || !perWord[index].length) return [cloneWord(word)];
      const hasReading = perWord[index].some(function(item) { return !!item.reading; });
      if (!hasReading) return null;
      return segmentsToWords(word, segmentsFromAlignment(texts[index], perWord[index]));
    });
  }

  function sliceReading(text, romaText, from, to) {
    for (let t = 0; t < 2; t++) {
      const reading = lineReadingFrom(null, romaText, text, t === 0);
      if (!reading) continue;
      const tokens = buildTokens([text], false, false);
      let strict = true;
      let shortCaps = solve(tokens, reading, false, true);
      if (!shortCaps) { strict = false; shortCaps = solve(tokens, reading, false, false); }
      if (!shortCaps) continue;
      const longCaps = solve(tokens, reading, true, strict) || shortCaps;
      const offsetAt = function(caps, charIndex) {
        for (let i = 0; i < tokens.length; i++) if (tokens[i].start >= charIndex) return caps.starts[i];
        return reading.length;
      };
      const a1 = offsetAt(shortCaps, from);
      const b1 = offsetAt(shortCaps, to);
      if (a1 !== offsetAt(longCaps, from) || b1 !== offsetAt(longCaps, to) || b1 <= a1) continue;
      return reading.slice(a1, b1);
    }
    return null;
  }

  function lineReadingFrom(romaWords, romaLineText, lineText, dropLatin) {
    const source = Array.isArray(romaWords) && romaWords.length
      ? romaWords.join(" ")
      : String(romaLineText || "");
    if (!source || typeof RomajiKana !== "object" || !RomajiKana) return null;

    let cleaned = source;
    (String(lineText || "").match(/[A-Za-z][A-Za-z']*(?:[ ,.!?-]+[A-Za-z][A-Za-z']*)+/g) || []).forEach(function(phrase) {
      const words = phrase.split(/[^A-Za-z']+/).filter(Boolean);
      const re = new RegExp(words.map(function(w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("[^A-Za-z']+"), "ig");
      cleaned = cleaned.replace(re, " ");
    });

    const latinOriginal = String(lineText || "").match(/[A-Za-z']+/g) || [];
    const latin = {};
    latinOriginal.forEach(function(w) { latin[w.toLowerCase()] = true; });
    const glueWords = {};
    latinOriginal.forEach(function(w) { if (w.length >= 3 || w === w.toUpperCase()) glueWords[w.toLowerCase()] = true; });
    const glueList = Object.keys(glueWords).sort(function(a, b) { return b.length - a.length; });

    let out = "";
    RomajiKana.tokenize(cleaned).forEach(function(token) {
      for (let k = 0; k < glueList.length; k++) {
        const word = glueList[k];
        if (token.source.length > word.length && token.source.indexOf(word) === 0) {
          const rest = RomajiKana.convertWord(token.source.slice(word.length));
          if (rest) out += rest;
          return;
        }
      }
      if (latin[token.source] && (dropLatin || token.kana == null)) return;
      if (token.kana == null) return;
      out += token.kana;
    });
    return out;
  }

  function textsOf(words) {
    return words.map(function(word) { return Array.isArray(word) ? String(word[2] || "") : ""; });
  }

  function splitWordAt(word, charIndex) {
    const text = String(word[2] || "");
    if (charIndex <= 0) return [null, word];
    if (charIndex >= text.length) return [word, null];
    const start = Number(word[0] || 0);
    const end = Number(word[1] || start);
    const mid = Math.round(start + (end - start) * charIndex / text.length);
    return [[start, mid, text.slice(0, charIndex)], [mid, end, text.slice(charIndex)]];
  }

  function alignFirst(texts, reading) {
    const hasParen = parenRanges(texts.join("")).length > 0;
    const passes = [[false, false], [true, false]].concat(hasParen ? [[false, true], [true, true]] : []);
    for (let pass = 0; pass < passes.length; pass++) {
      const tokens = buildTokens(texts, passes[pass][0], passes[pass][1]);
      if (!tokens.some(function(token) { return token.kind === "kanji"; })) return null;
      const aligned = alignTokens(tokens, reading, texts, {});
      if (aligned.ok) return { tokens: tokens, aligned: aligned };
    }
    return null;
  }

  function tokensContiguous(tokens, texts, a, b) {
    const ta = tokens[a];
    const tb = tokens[b];
    return !ta.digit && !ta.inline && !tb.digit && !tb.inline &&
      tb.word === ta.word + 1 && ta.end === String(texts[ta.word] || "").length && tb.start === 0;
  }

  function planMerges(words, reading) {
    if (!reading) return null;
    let current = words;
    let changed = false;

    if (!alignFirst(textsOf(words), reading)) {
      const baseTexts = textsOf(words);
      const baseTokens = buildTokens(baseTexts, false, false);
      const candidates = [];
      let run = [];
      function flushRun() {
        if (run.length >= 2) {
          const first = baseTokens[run[0]];
          const last = baseTokens[run[run.length - 1]];
          candidates.push({ wa: first.word, charA: first.start, wb: last.word, charB: last.end });
        }
        run = [];
      }
      baseTokens.forEach(function(token, ti) {
        if (token.kind !== "kanji" || token.digit || token.inline) { flushRun(); return; }
        if (run.length && !tokensContiguous(baseTokens, baseTexts, run[run.length - 1], ti)) flushRun();
        run.push(ti);
      });
      flushRun();
      let chosen = null;
      for (let c = 1; c <= candidates.length && !chosen; c++) {
        const attempt = candidates.slice(0, c);
        if (alignFirst(textsOf(mergeRegions(words, attempt)), reading)) chosen = attempt;
      }
      if (!chosen) return null;
      for (let k = chosen.length - 1; k >= 0; k--) {
        const without = chosen.slice(0, k).concat(chosen.slice(k + 1));
        if (!without.length) continue;
        if (alignFirst(textsOf(mergeRegions(words, without)), reading)) chosen = without;
      }
      current = mergeRegions(words, chosen);
      changed = true;
    }

    for (let round = 0; round < 4; round++) {
      const texts = textsOf(current);
      const found = alignFirst(texts, reading);
      if (!found || !found.aligned.unresolved.length) break;
      const tokens = found.tokens;
      const aligned = found.aligned;

      const regions = [];
      aligned.mergeable.forEach(function(group) {
        const first = tokens[group[0]];
        const last = tokens[group[group.length - 1]];
        const previous = regions.length ? regions[regions.length - 1] : null;
        if (previous && first.word <= previous.wb) return;
        regions.push({ wa: first.word, charA: first.start, wb: last.word, charB: last.end });
      });
      if (regions.length) {
        current = mergeRegions(current, regions);
        changed = true;
        continue;
      }

      let progressed = false;
      for (let g = 0; g < aligned.unresolved.length && !progressed; g++) {
        const group = aligned.unresolved[g];
        const segments = [];
        let segment = [group[0]];
        for (let k = 1; k < group.length; k++) {
          if (tokensContiguous(tokens, texts, group[k - 1], group[k])) segment.push(group[k]);
          else { segments.push(segment); segment = [group[k]]; }
        }
        segments.push(segment);
        if (segments.length < 2) continue;
        const candidates = segments.filter(function(seg) { return seg.length >= 2; })
          .sort(function(a, b) { return b.length - a.length; });
        for (let c = 0; c < candidates.length && !progressed; c++) {
          const seg = candidates[c];
          const first = tokens[seg[0]];
          const last = tokens[seg[seg.length - 1]];
          const trial = mergeRegions(current, [{ wa: first.word, charA: first.start, wb: last.word, charB: last.end }]);
          const next = alignFirst(textsOf(trial), reading);
          if (next && next.aligned.unresolved.length < aligned.unresolved.length) {
            current = trial;
            changed = true;
            progressed = true;
          }
        }
      }
      if (!progressed) break;
    }
    return changed ? current : null;
  }

  function mergeRegions(words, regions) {
    const result = words.slice();
    regions.slice().sort(function(a, b) { return b.wa - a.wa; }).forEach(function(region) {
      const pieces = [];
      const head = splitWordAt(result[region.wa], region.charA);
      if (head[0]) pieces.push(head[0]);
      const tail = head[1];
      let text = String(tail[2] || "");
      let endTime = Number(tail[1] || 0);
      for (let k = region.wa + 1; k <= region.wb; k++) {
        if (k === region.wb) {
          const cut = splitWordAt(result[k], region.charB);
          text += String(cut[0][2] || "");
          endTime = Number(cut[0][1] || 0);
          pieces.push([Number(tail[0] || 0), endTime, text]);
          if (cut[1]) pieces.push(cut[1]);
        } else {
          text += String(result[k][2] || "");
        }
      }
      result.splice.apply(result, [region.wa, region.wb - region.wa + 1].concat(pieces));
    });
    return result;
  }

  function annotateLine(line, romaWords, romaLineText, stats, lineLevel) {
    if (!Array.isArray(line) || !Array.isArray(line[2])) return line;
    let words = line[2];
    const lineText = textsOf(words).join("");
    if (lineLevel && words.length === 1 && Array.isArray(words[0]) &&
        Number(words[0][0]) === Number(line[0]) && Number(words[0][1]) === Number(line[1])) {
      const sungMs = Math.min(20000, Math.max(8000, lineText.replace(/\s+/g, "").length * 1000));
      if (Number(line[1]) - Number(line[0]) > sungMs) {
        const sungEnd = Number(line[0]) + sungMs;
        const shortened = line.slice();
        shortened[1] = sungEnd;
        shortened[2] = [[words[0][0], sungEnd, words[0][2]].concat(words[0].slice(3))];
        return annotateLine(shortened, romaWords, romaLineText, stats, false);
      }
    }
    if (!hasKanji(lineText)) return line;
    if (SIMPLIFIED_ONLY_RE.test(lineText)) return line;

    let parts = null;
    let method = "line-romaji";
    const readingTries = [lineReadingFrom(romaWords, romaLineText, lineText, true), lineReadingFrom(romaWords, romaLineText, lineText, false)];
    for (let t = 0; t < readingTries.length && !parts; t++) {
      if (t === 1 && readingTries[1] === readingTries[0]) break;
      const reading = readingTries[t];
      let tryWords = words;
      let tryRoma = romaWords;
      const merged = planMerges(words, reading);
      if (merged) {
        tryWords = merged;
        tryRoma = null;
      }
      const attempt = annotateByLineReading(tryWords, reading, tryRoma);
      if (attempt) { parts = attempt; words = tryWords; romaWords = tryRoma; }
    }
    if (!parts) {
      parts = annotateByWordRomaji(words, romaWords);
      method = "word-romaji";
    }
    if (!parts) parts = words.map(function() { return null; });

    const nextWords = [];
    words.forEach(function(word, index) {
      const split = parts[index] || [cloneWord(word)];
      split.forEach(function(item) {
        if (wordHasRuby(item) && !wordHasRuby(word)) stats[method] = (stats[method] || 0) + 1;
        nextWords.push(item);
      });
    });

    const nextLine = line.slice();
    nextLine[2] = nextWords;
    return nextLine;
  }

  // 署名、歌名等信息行不注音
  const CREDIT_LABELS = [
    "作词", "作詞", "作曲", "编曲", "編曲", "词", "詞", "曲", "填词", "填詞", "词曲", "詞曲",
    "作词者", "作詞者", "作曲者", "编曲者", "編曲者", "作詞家", "作曲家", "編曲家",
    "制作人", "製作人", "制作", "製作", "监制", "監製", "出品", "发行", "發行", "出品人",
    "混音", "母带", "母帶", "录音", "錄音", "和声", "和聲", "演唱", "原唱", "翻唱", "歌手", "歌",
    "吉他", "贝斯", "貝斯", "鼓", "键盘", "鍵盤", "钢琴", "鋼琴", "弦乐", "弦樂", "合声", "人声", "配唱",
    "歌名", "曲名", "原曲", "企划", "企劃", "统筹", "統籌", "封面", "OP", "SP", "ISRC",
    "プロデューサー", "ボーカル", "歌詞", "編曲者", "作詞・作曲", "作詞作曲",
    "lyrics", "lyric", "lyricist", "lyrics by", "written by", "composer", "composed by", "music",
    "music by", "arranger", "arranged by", "arrangement", "producer", "produced by", "vocal", "vocals",
    "mix", "mixed by", "mixing", "mastering", "mastered by", "guitar", "bass", "drums", "piano", "chorus"
  ];
  const CREDIT_LABEL_RE = (function() {
    const escaped = CREDIT_LABELS
      .slice()
      .sort(function(a, b) { return b.length - a.length; })
      .map(function(label) { return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); })
      .join("|");
    const one = "(?:" + escaped + ")";
    return new RegExp("^\\s*[\\(（\\[【]?\\s*" + one + "(?:\\s*[\\/／、&＆・·,，]\\s*" + one + ")*\\s*[\\)）\\]】]?\\s*[:：]", "i");
  })();

  function normalizeForCompare(text) {
    return String(text || "").toLowerCase().replace(/[\s\-－–—_·・/／:：|｜()（）\[\]【】「」『』"'“”]/g, "");
  }

  function artistParts(artist) {
    return String(artist || "").split(/[\/、,，&＆・;；]/).map(normalizeForCompare).filter(function(part) {
      return part.length >= 2;
    });
  }

  function isCreditLine(text, tags, index) {
    const value = String(text || "").trim();
    if (!value) return false;
    if (CREDIT_LABEL_RE.test(value)) return true;
    if (/^\s*(?:lyrics|lyric|words|music|composed|written|arranged|produced|mixed|mastered|vocals?)(?:\s+&\s+\w+)?\s+by\b/i.test(value)) return true;

    if (index < 5 && tags) {
      const line = normalizeForCompare(value);
      const title = normalizeForCompare(tags.ti);
      const artist = normalizeForCompare(tags.ar);
      if (!line) return false;
      const hasDash = /\s[-－–—]\s/.test(value);
      if (hasDash && artistParts(tags.ar).some(function(part) { return line.indexOf(part) >= 0; })) return true;
      if (!title) return false;
      if (hasDash && title.length >= 3 && line.indexOf(title) === 0) return true;
      if (line === title) return true;
      if (artist && (line === title + artist || line === artist + title)) return true;
      if (artist && line.indexOf(title) >= 0 && line.indexOf(artist) >= 0 && line.length <= title.length + artist.length + 4) return true;
    }
    return false;
  }

  function compactOriginalText(lines) {
    return (Array.isArray(lines) ? lines : []).map(function(line) {
      const words = Array.isArray(line) && Array.isArray(line[2]) ? line[2] : [];
      return words.map(function(word) { return Array.isArray(word) ? String(word[2] || "") : ""; }).join("");
    }).join("\n");
  }

  function annotateLyricsResult(result, romanizationWords, options) {
    if (!result || result.type !== "structured" || !Array.isArray(result.original)) return result;
    if (!isProbablyJapanese(compactOriginalText(result.original))) return result;

    const romaByStart = {};
    (Array.isArray(result.romanization) ? result.romanization : []).forEach(function(line) {
      if (Array.isArray(line) && typeof line[2] === "string") romaByStart[String(line[0])] = line[2];
    });
    const romaWords = Array.isArray(romanizationWords) ? romanizationWords : [];

    const stats = {};
    const original = result.original.map(function(line, index) {
      const lineText = Array.isArray(line) && Array.isArray(line[2]) ? textsOf(line[2]).join("") : "";
      if (isCreditLine(lineText, result.tags, index)) {
        stats.creditLines = (stats.creditLines || 0) + 1;
        return line;
      }
      const romaText = Array.isArray(line) ? romaByStart[String(line[0])] : null;
      return annotateLine(line, romaWords[index] || null, romaText || null, stats, !!(options && options.lineLevel));
    });

    const hasRuby = original.some(function(line) {
      const words = Array.isArray(line) && Array.isArray(line[2]) ? line[2] : [];
      return words.some(wordHasRuby);
    });
    const next = {};
    Object.keys(result).forEach(function(key) { next[key] = result[key]; });
    next.language = "ja";
    if (!hasRuby) return next;

    next.original = original;
    next.romanization = null;
    next.timing = "Word";

    try {
      if (typeof Platform === "object" && Platform && Platform.log && Platform.log.debug) {
        Platform.log.debug("Furigana", "ruby words: " + JSON.stringify(stats));
      }
    } catch (e) {}

    return next;
  }

  return {
    annotateLyricsResult: annotateLyricsResult,
    sliceReading: sliceReading,
    hasJapaneseText: hasJapaneseText,
    isProbablyJapanese: isProbablyJapanese,
    kataToHira: kataToHira,
    _solve: solve,
    _buildTokens: buildTokens
  };
})();

var FuriganaTtml = (function() {
  function xmlEscape(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function msToTtmlTime(ms) {
    const value = Math.max(0, Math.round(Number(ms || 0)));
    const hours = Math.floor(value / 3600000);
    const minutes = Math.floor((value % 3600000) / 60000);
    const seconds = Math.floor((value % 60000) / 1000);
    const millis = value % 1000;

    function pad(number, size) {
      let text = String(number);
      while (text.length < size) text = "0" + text;
      return text;
    }

    return pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + "." + pad(millis, 3);
  }

  function wordToTtml(word) {
    if (!Array.isArray(word)) return "";

    const text = xmlEscape(word[2] || "");
    const ruby = Array.isArray(word[3]) && word[3].length ? word[3] : null;
    if (!ruby) return "<span>" + text + "</span>";

    const rubyText = ruby.map(function(item) {
      return Array.isArray(item) ? String(item[2] || "") : "";
    }).join("");

    return "<span tts:ruby=\"container\">" +
      "<span tts:ruby=\"base\">" + text + "</span>" +
      "<span tts:ruby=\"textContainer\"><span tts:ruby=\"text\">" + xmlEscape(rubyText) + "</span></span>" +
      "</span>";
  }

  function buildRubyTtml(result) {
    const tags = result && result.tags ? result.tags : {};
    const original = result && Array.isArray(result.original) ? result.original : [];
    const bodyEnd = original.reduce(function(max, line) {
      return Math.max(max, Number((Array.isArray(line) && line[1]) || 0));
    }, 0);

    const lines = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<tt xmlns=\"http://www.w3.org/ns/ttml\" xmlns:ttm=\"http://www.w3.org/ns/ttml#metadata\" xmlns:tts=\"http://www.w3.org/ns/ttml#styling\" xmlns:itunes=\"http://music.apple.com/lyric-ttml-internal\" xml:lang=\"" + xmlEscape(result.language || "ja") + "\" itunes:timing=\"Word\">",
      "<head>",
      "<metadata>",
      "<ttm:title>" + xmlEscape(tags.ti || "") + "</ttm:title>",
      "<ttm:artist>" + xmlEscape(tags.ar || "") + "</ttm:artist>",
      "</metadata>",
      "</head>",
      "<body dur=\"" + msToTtmlTime(bodyEnd) + "\">",
      "<div>"
    ];

    original.forEach(function(line, index) {
      if (!Array.isArray(line)) return;
      const begin = msToTtmlTime(line[0]);
      const end = msToTtmlTime(line[1]);
      const words = Array.isArray(line[2]) ? line[2] : [];
      lines.push("<p begin=\"" + begin + "\" end=\"" + end + "\" itunes:key=\"L" + (index + 1) + "\">" + words.map(wordToTtml).join("") + "</p>");
    });

    lines.push("</div>", "</body>", "</tt>");
    return lines.join("\n");
  }

  return {
    buildRubyTtml: buildRubyTtml,
    msToTtmlTime: msToTtmlTime
  };
})();
