# 用法：python3 tools/build-kanji-readings.py kanji.json japanese-lyrics-furigana/lib/03_kanji_readings.js
# kanji.json 来自 https://github.com/davidluzgouveia/kanji-data （基于 KANJIDIC，EDRDG，CC BY-SA 4.0）
import json, sys
src, dst = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding='utf-8'))
def hira(s):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)
table = {}
for ch, info in data.items():
    if info.get('grade') is None:   # 只收常用 + 人名用
        continue
    rs = []
    for r in (info.get('readings_on') or []) + (info.get('readings_kun') or []):
        r = hira(r).replace('-', '').split('.')[0].strip()
        if r and r not in rs:
            rs.append(r)
    if rs:
        table[ch] = '|'.join(rs)
body = ''.join(ch + ':' + r + ';' for ch, r in sorted(table.items()))
with open(dst, 'w', encoding='utf-8') as f:
    f.write('// 单字汉字音训读音表（离线），由 tools/build-kanji-readings.py 生成。仅用于在罗马音读音的多种切分中选出正确的一种。\n')
    f.write('// 数据来源：KANJIDIC（© Electronic Dictionary Research and Development Group，https://www.edrdg.org/ ），\n')
    f.write('//   经 https://github.com/davidluzgouveia/kanji-data （MIT）整理；按 CC BY-SA 4.0 使用：https://creativecommons.org/licenses/by-sa/4.0/\n')
    f.write('// 修改说明：仅保留常用汉字与人名用汉字；片假名读音转为平假名；去除送假名与连字符标记。\n')
    f.write('// 本文件作为 KANJIDIC 的改编，同样以 CC BY-SA 4.0 授权。\n')
    f.write('var FURIGANA_KANJI_READINGS_RAW = ' + json.dumps(body, ensure_ascii=False) + ';\n')
print(len(table), 'kanji')
