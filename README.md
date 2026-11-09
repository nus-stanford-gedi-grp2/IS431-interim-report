# GEDI Hotel Report

## Setup and preview

From the repository root (Python required):

1. Set up dependencies

```bash
python -m venv .venv
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. View site

```
python -m mkdocs serve
```

Open http://127.0.0.1:8000. Saved edits automatically refresh the preview. Stop with `Ctrl+C`; on later sessions, activate the environment and run `mkdocs serve` again.

To compile the static website:

```bash
mkdocs build
```

The generated files go into `site/`. Edit the sources below, not `site/`.

## Where to edit

Write your assigned section in its Markdown file under `docs/chapters/`:

| Section | File |
| --- | --- |
| Acknowledgements | `00-acknowledgements.md` |
| 1. Introduction | `01-introduction.md` |
| 2. Context | `02-context.md` |
| 3. Problem Statement | `03-problem-statement.md` |
| 4. Research and Problem Investigation | `04-research.md` |
| 5. Fieldwork and Key Findings | `05-fieldwork.md` |
| 6. Prototype Development | `06-prototype.md` |
| 7. Evaluation | `07-evaluation.md` |
| 8. Conclusion and Next Steps | `08-conclusion.md` |
| References and Appendices | `09-references.md` |

Keep the existing `##` chapter heading and its `{#anchor}`. Add subsections with `###` and smaller headings with `####`; these appear in the report navigation. Replace the placeholder summaries with your content.

Put figures in `docs/assets/` and reference them from chapter files as `![Description](../assets/filename.png)`.

`docs/index.md` assembles the chapters into one page; no changes there are needed for ordinary writing. The playbook lives in `docs/apps/playbook/` and is embedded by `06-prototype.md`; preserve its embed and relative asset paths.
