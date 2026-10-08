function neParseTimeMs(min, sec, fraction) {
  const ms = String(fraction || "0").padEnd(3, "0").slice(0, 3);
  return (Number(min) * 60 + Number(sec)) * 1000 + Number(ms);
}


function neParseLrc(text) {
  const timed = [];

  String(text || "").split(/\r?\n/).forEach(function (line) {
    const matches = [];
    const timeRe = /\[(\d{1,}):(\d{2})(?:[.:](\d{1,3}))?]/g;
    let timeMatch;

    while ((timeMatch = timeRe.exec(line)) !== null) {
      matches.push(timeMatch);
    }

    if (!matches.length) return;

    const last = matches[matches.length - 1];
    const content = line.slice(last.index + last[0].length).trim();

    if (!content) return;

    matches.forEach(function (match) {
      const start = neParseTimeMs(match[1], match[2], match[3]);
      timed.push([start, content]);
    });
  });

  timed.sort(function (a, b) {
    return a[0] - b[0];
  });

  return timed.map(function (line, index) {
    const end = timed[index + 1]
      ? Math.max(line[0], timed[index + 1][0] - 10)
      : line[0] + 3000;

    return [line[0], end, line[1]];
  });
}

