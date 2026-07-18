# Temporary curriculum inputs

Place large local textbook PDFs under `content/tmp/curriculum/`.

That directory is intentionally ignored by Git because source PDFs and extraction
scratch files can be large. Example:

```bash
pnpm curriculum:ingest:pdf -- --source content/tmp/curriculum/lenguaje-7.pdf --grade 7 --subject lenguaje --document lenguaje-7 --replace-source
```
