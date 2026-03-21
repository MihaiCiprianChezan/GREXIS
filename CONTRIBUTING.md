# Contributing to GREXIS

GREXIS is in pre-implementation documentation phase. Contributions to the PRD and Tech Spec are welcome.

---

## What lives here

| Path | Audience | Change process |
|---|---|---|
| `docs/PRD/` | Stakeholders, product | Propose via GitHub Issue, discuss, PR |
| `docs/tech-spec/` | Engineers | Propose via GitHub Issue, discuss, PR |
| `CHANGELOG.md` | Everyone | Updated with every version bump |

---

## How to propose a change

1. **Open an Issue** describing what you want to change and why
2. Reference the specific section and version of the document
3. If accepted, submit a **Pull Request** with:
   - The updated document (bumped version number in filename and footer)
   - A summary entry added to `CHANGELOG.md`
4. Changes to the PRD require review by at least one stakeholder
5. Changes to the Tech Spec require review by at least one engineer

---

## Version numbering

Both documents use `v0.X` during pre-implementation.  
`v1.0` marks the first implementation-frozen version.  
After `v1.0`, breaking changes bump the minor version (`v1.1`, `v1.2`).

---

## Style rules

- Markdown only — no DOCX, no PDFs, no HTML
- No emoji in document content
- All diagrams in ASCII or Mermaid — no binary image files in docs
- Every section change logged in CHANGELOG with one-line summary

---

## Authors

Mihai Ciprian Chezan & Claude (Anthropic) — 2026
