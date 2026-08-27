from pathlib import Path

path = Path('scripts/.judgment-materials-repair.py')
source = path.read_text()
replacements = [
    (
        "    new, count = re.subn(pattern, repl, text, count=1, flags=re.S)",
        "    new, count = re.subn(pattern, lambda _match: repl, text, count=1, flags=re.S)",
        'literal regex replacement'
    ),
    (
        "  const clean = (value) => String(value || '').trim().replace(/^(?:候補|option)\\s*/i, '').replace(/\\s*(?:を|について)$/u, '');",
        "  const clean = (value) => String(value || '').trim().replace(/^(?:候補|option)\\s*/i, '').replace(/\\s*を[^、。]{1,80}で$/u, '').replace(/\\s*(?:を|について)$/u, '');",
        'candidate criteria suffix separation'
    ),
    (
        "    assert.deepEqual(out.result.comparison.comparison_candidates.map((item) => item.label), ['A案','B案を費用と安全性で']);",
        "    assert.deepEqual(out.result.comparison.comparison_candidates.map((item) => item.label), ['A案','B案']);",
        'candidate golden expectation'
    )
]
for old, new, label in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    source = source.replace(old, new, 1)
path.write_text(source)
exec(compile(source, str(path), 'exec'), {'__name__': '__main__', '__file__': str(path)})
