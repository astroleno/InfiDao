# Six Classics Data

This directory contains the text data for the Six Classics (六经) used in the InfiDao project.

## Directory Structure

```
data/sixclassics/
├── 论语_学而篇.jsonl
├── 论语_为政篇.jsonl
├── 孟子_梁惠王上.jsonl
├── 大学_经一章.jsonl
├── 中庸_第一章.jsonl
├── 诗经_周南.jsonl
├── 尚书_尧典.jsonl
└── ...
```

## Data Format

Each file should be in JSONL format (one JSON object per line):

```json
{"text": "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？", "section": 1}
{"text": "其为人也孝弟，而好犯上者，鲜矣；不好犯上，而好作乱者，未之有也。", "section": 2}
{"text": "巧言令色，鲜矣仁。", "section": 3}
```

## Data Sources

1. **论语** - The Analects of Confucius
   - 20 chapters
   - ~500 passages

2. **孟子** - Mencius
   - 7 books
   - ~350 passages

3. **大学** - The Great Learning
   - 1 text + 10 commentaries
   - ~50 passages

4. **中庸** - The Doctrine of the Mean
   - 1 chapter with 33 sections
   - ~50 passages

5. **诗经** - Book of Odes
   - 311 poems
   - ~400 passages

6. **尚书** - Book of Documents
   - 58 chapters
   - ~200 passages

## Processing Notes

- Each passage should be 50-200 characters
- Maintain semantic coherence
- Include section numbers for reference
- Text should be in traditional or simplified Chinese consistently

## Sample Data Generator

If you don't have the actual texts, the import script will generate sample data for testing.