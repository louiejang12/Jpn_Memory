"""KANJI_NOTES(words.js)에 나오는 모든 글자의 KanjiVG 획 데이터를 받아 kanji_strokes.js 로 묶는다.

실행: python tools/build_strokes.py
획 데이터: KanjiVG (c) Ulrich Apel, CC BY-SA 3.0, https://kanjivg.tagaini.net
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDS = ROOT / "words.js"
OUT = ROOT / "kanji_strokes.js"
URL = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{:05x}.svg"


def note_chars():
    src = WORDS.read_text(encoding="utf-8")
    i = src.index("const KANJI_NOTES")
    block = src[i:]
    words = re.findall(r'\[\s*"([^"]+)"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*\]', block)
    chars = []
    for w in words:
        for c in w:
            if c not in chars:
                chars.append(c)
    return words, chars


def fetch(ch):
    url = URL.format(ord(ch))
    for n in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(1 + n)
    raise RuntimeError(f"{ch} ({url}): {err}")


def strokes(svg, ch):
    # 획 path 만: id="kvg:0904b-s1" 처럼 -sN 으로 끝나는 것, 문서 순서 = 획순
    out = []
    for m in re.finditer(r"<path\b([^>]*)/?>", svg):
        attrs = m.group(1)
        pid = re.search(r'id="kvg:[0-9a-f]+-s(\d+)"', attrs)
        d = re.search(r'\sd="([^"]+)"', attrs)
        if pid and d:
            out.append((int(pid.group(1)), d.group(1).strip()))
    nums = [n for n, _ in out]
    if nums != list(range(1, len(nums) + 1)):
        raise RuntimeError(f"{ch}: 획 번호 순서가 이상함 {nums}")
    return [d for _, d in out]


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    words, chars = note_chars()
    data, missing = {}, []
    for ch in chars:
        try:
            data[ch] = strokes(fetch(ch), ch)
            if not data[ch]:
                missing.append(ch)
        except Exception as e:  # noqa: BLE001
            print("실패:", e)
            missing.append(ch)
    head = (
        "// 한자 쓰기 본보기·획순 데이터 (tools/build_strokes.py 로 생성, 직접 고치지 말 것)\n"
        "// 획 데이터: KanjiVG (c) Ulrich Apel, CC BY-SA 3.0, https://kanjivg.tagaini.net\n"
        "// 형식: 글자 -> 획순대로 SVG path d 값 (viewBox 0 0 109 109)\n"
    )
    body = "const KANJI_STROKES = {\n" + "".join(
        f"  {json.dumps(ch, ensure_ascii=False)}: {json.dumps(data[ch], ensure_ascii=False)},\n" for ch in chars if ch in data
    ) + "};\n"
    OUT.write_text(head + body, encoding="utf-8", newline="\n")
    word_miss = [w for w in words if any(c not in data or not data[c] for c in w)]
    print(f"단어 {len(words)}개, 글자 {len(chars)}자, 받은 글자 {len(data)}자, 총 획 {sum(len(v) for v in data.values())}")
    print(f"누락 글자 {len(missing)}: {''.join(missing)}")
    print(f"본보기 없는 단어 {len(word_miss)}: {' '.join(word_miss)}")
    print(f"저장: {OUT} ({OUT.stat().st_size} bytes)")
    return 1 if missing or word_miss else 0


if __name__ == "__main__":
    sys.exit(main())
