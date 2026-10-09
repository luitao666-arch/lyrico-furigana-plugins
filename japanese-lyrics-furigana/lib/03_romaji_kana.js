// 罗马音 → 平假名（离线、纯 JS，QuickJS 兼容）
// - 支持 Hepburn 与常见训令式写法（si/ti/tu/hu/zi/sya…）
// - 促音：双写辅音（kitto → きっと、matcha → まっちゃ）
// - 拨音：n / n' / nn / m+b/p/m（kan'i → かんい，shimbun → しんぶん）
// - 长音：ou/oo/aa/ii/uu/ee 原样保留为假名序列；长音符号 ā ī ū ē ō 展开为 aa ii uu ee ou
// - 输入里已有的假名直接保留（片假名转平假名）
// - 无法完整转换的 token 返回 null，由调用方决定丢弃或放弃对齐
var RomajiKana = (function() {
  const TABLE = {
    a: "あ", i: "い", u: "う", e: "え", o: "お",
    ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
    sa: "さ", shi: "し", si: "し", su: "す", se: "せ", so: "そ",
    ta: "た", chi: "ち", ti: "ち", tsu: "つ", tu: "つ", te: "て", to: "と",
    na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
    ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
    ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
    ya: "や", yu: "ゆ", yo: "よ",
    ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
    wa: "わ", wi: "うぃ", we: "うぇ", wo: "を",
    ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
    za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
    da: "だ", di: "でぃ", du: "どぅ", de: "で", do: "ど",
    ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
    pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
    va: "ゔぁ", vi: "ゔぃ", vu: "ゔ", ve: "ゔぇ", vo: "ゔぉ",
    fa: "ふぁ", fi: "ふぃ", fe: "ふぇ", fo: "ふぉ",
    kya: "きゃ", kyu: "きゅ", kyo: "きょ",
    sha: "しゃ", shu: "しゅ", she: "しぇ", sho: "しょ",
    sya: "しゃ", syu: "しゅ", syo: "しょ",
    cha: "ちゃ", chu: "ちゅ", che: "ちぇ", cho: "ちょ",
    tya: "ちゃ", tyu: "ちゅ", tyo: "ちょ",
    nya: "にゃ", nyu: "にゅ", nyo: "にょ",
    hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ",
    mya: "みゃ", myu: "みゅ", myo: "みょ",
    rya: "りゃ", ryu: "りゅ", ryo: "りょ",
    gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
    ja: "じゃ", ju: "じゅ", je: "じぇ", jo: "じょ",
    zya: "じゃ", zyu: "じゅ", zyo: "じょ",
    jya: "じゃ", jyu: "じゅ", jyo: "じょ",
    bya: "びゃ", byu: "びゅ", byo: "びょ",
    pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
    dya: "ぢゃ", dyu: "ぢゅ", dyo: "ぢょ",
    tsa: "つぁ", tse: "つぇ", tso: "つぉ",
    thi: "てぃ", dhi: "でぃ", twu: "とぅ", dwu: "どぅ",
    xa: "ぁ", xi: "ぃ", xu: "ぅ", xe: "ぇ", xo: "ぉ",
    xya: "ゃ", xyu: "ゅ", xyo: "ょ", xtsu: "っ", xtu: "っ"
  };

  const VOWELS = "aiueo";
  const MACRONS = {
    "ā": "aa", "â": "aa", "ī": "ii", "î": "ii", "ū": "uu", "û": "uu",
    "ē": "ee", "ê": "ee", "ō": "ou", "ô": "ou"
  };
  const KANA_RE = /[ぁ-ゖァ-ヺー]/;

  function kataToHira(text) {
    return String(text || "").replace(/[ァ-ヶ]/g, function(ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
  }

  function isVowel(ch) {
    return VOWELS.indexOf(ch) >= 0;
  }

  function isConsonant(ch) {
    return /[a-z]/.test(ch) && !isVowel(ch);
  }

  function convertWord(word) {
    const s = word;
    let out = "";
    let i = 0;

    while (i < s.length) {
      const c = s.charAt(i);
      const next = s.charAt(i + 1);

      if (c === "'") {
        if (isConsonant(next) && (i === 0 || isVowel(s.charAt(i - 1)))) {
          let j = i + 1;
          while (j < s.length && isConsonant(s.charAt(j))) j++;
          if (j >= s.length) { out += "っ"; break; }
          if (next !== s.charAt(i + 2)) out += "っ";
        }
        i++;
        continue;
      }

      if (c === "n") {
        if (next === "'") { out += "ん"; i += 2; continue; }
        if (next === "n") {
          const after = s.charAt(i + 2);
          if (!after || (!isVowel(after) && after !== "y")) { out += "ん"; i += 2; continue; }
        }
        if (!next || (!isVowel(next) && next !== "y")) { out += "ん"; i++; continue; }
      }

      if (c === "m" && (next === "b" || next === "p")) { out += "ん"; i++; continue; }

      if (isConsonant(c) && c !== "n" && c === next) { out += "っ"; i++; continue; }
      if (c === "t" && next === "c" && s.charAt(i + 2) === "h") { out += "っ"; i++; continue; }

      let matched = false;
      for (let len = 4; len > 0; len--) {
        const part = s.substr(i, len);
        if (part.length === len && TABLE[part]) {
          out += TABLE[part];
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) return null;
    }

    return out;
  }

  const VOICED_CONSONANT = { k: "g", s: "z", t: "d", h: "b", f: "b", sh: "j", ch: "j", ts: "z" };
  function voiceSyllable(syllable) {
    const m = /^(sh|ch|ts|[kstfh])(.*)$/.exec(syllable);
    if (m) return VOICED_CONSONANT[m[1]] + m[2];
    return syllable === "u" ? "vu" : syllable;
  }
  function fixPunctuationAndVoicing(text) {
    let value = String(text || "");
    try { value = value.normalize("NFC"); } catch (e) {}
    return value
      .replace(/([a-zA-Z]+)\s*[゙゛\u3099\uFF9E]/g, function(whole, syllable) { return voiceSyllable(syllable.toLowerCase()); })
      .replace(/([a-zA-Z]+)\s*[゚゜\u309A\uFF9F]/g, function(whole, syllable) { return syllable.replace(/^[hf]/i, "p"); })
      .replace(/[、。，,.!！?？…・:：;；"“”「」『』()（）\[\]【】~～―—\/／\-]/g, " ");
  }

  function normalize(text) {
    return fixPunctuationAndVoicing(text)
      .toLowerCase()
      .replace(/[āâīîūûēêōô]/g, function(ch) { return MACRONS[ch] || ch; })
      .replace(/[’‘`´]/g, "'");
  }

  function altSpelling(word) {
    return word.replace(/^wu/, "u").replace(/xi/g, "shi").replace(/qi/g, "chi").replace(/cu/g, "tsu").replace(/l/g, "r")
      .replace(/(sh|ch|j)i([aou])/g, "$1$2").replace(/([kgnhbpmr])i(y?)o/g, "$1yo");
  }

  let nativeDu = false;

  function setNativeDu(value) {
    nativeDu = !!value;
  }

  function nativeVoicing(kana) {
    return nativeDu && kana ? kana.replace(/どぅ/g, "づ").replace(/でぃ/g, "ぢ") : kana;
  }

  function tokenize(text) {
    const value = normalize(text);
    const tokens = [];
    const re = /[a-z']+|[ぁ-ゖァ-ヺー]+/g;
    const parts = value.match(re) || [];
    for (let pi = 0; pi < parts.length; pi++) {
      let src = parts[pi];
      const marker = /^'([bcdfghjklmpqrstvwxyz]+)$/.exec(src);
      if (marker && /^[a-z]+$/.test(parts[pi + 1] || "") && parts[pi + 1].charAt(0) !== marker[1].charAt(0)) {
        src = "'" + marker[1] + parts[pi + 1];
        pi++;
      }
      if (KANA_RE.test(src)) {
        tokens.push({ source: src, kana: kataToHira(src) });
      } else {
        const trimmed = src.replace(/'+$/, "");
        if (!trimmed.replace(/'/g, "")) continue;
        let kana = convertWord(trimmed);
        if (kana == null && /[lxqc]/.test(trimmed)) kana = convertWord(altSpelling(trimmed));
        tokens.push({ source: trimmed, kana: nativeVoicing(kana) });
      }
    }
    return tokens;
  }

  function toHiragana(text, strict) {
    const tokens = tokenize(text);
    let out = "";
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].kana == null) {
        if (strict) return null;
        continue;
      }
      out += tokens[i].kana;
    }
    return out;
  }

  return {
    toHiragana: toHiragana,
    tokenize: tokenize,
    convertWord: convertWord,
    kataToHira: kataToHira,
    setNativeDu: setNativeDu
  };
})();
