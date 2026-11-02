# Editor variants (decision pending)

`gherkit edit [folder]` contains four variants that can be switched in the top bar (and via
`#variant=code|doc|struct|split`). All four are working on real files so they can be tried
on real specifications before we decide which ones to develop further.

Common to all: folder picker (start anywhere, switch later), file list, problems panel
(syntax + lint), outline, facts (scenarios, test cases, steps, tags), format, save, German and
English UI. Everything is computed by the official Gherkin parser on the server.

## A · Code

![Code variant](img/editor-code.png)

Plain text with highlighting from the **official scanner tokens** (not a home-made grammar),
error markers in the gutter, completion for keywords of the file's language and for steps used
anywhere in the folder.

- \+ exact, fast, every spec feature available, familiar for testers and developers
- − business users must know Gherkin syntax

![Errors](img/editor-broken.png)

## B · Document

![Document variant](img/editor-doc.png)

Read view rendered from the AST: Markdown in descriptions, tags as chips, tables,
DocStrings with media type, Rules as sections, "yields n test cases" for outlines. ✎ jumps to
the line in the Code view.

- \+ best for reviews with business people, ideal base for "living documentation"
- − read only

## C · Structure

![Structure variant](img/editor-struct.png)

Form editor on the AST: add, move and delete Background, Scenario, Outline and Rule blocks,
steps with keyword selection and step completion, data tables and Examples as grids,
DocStrings, tags. Changing the language translates every keyword by its role. The server prints
canonical Gherkin from the edited AST, so the result is always valid.

- \+ no syntax knowledge needed, valid by construction
- − comments of changed parts may move; free layout is not possible (canonical format)

## D · Split

![Split variant](img/editor-split.png)

Code and Document side by side, the document updates while typing.

- \+ writers see immediately how the specification reads
- − needs a wide screen

## Options for the next step

| Option | Effort | Recommendation |
| --- | --- | --- |
| Keep all four, polish Code + Document first | small | ✅ default |
| Replace the Code textarea by CodeMirror 6 (multi-cursor, folding, search) bundled offline | medium | when editing large files becomes common |
| Monaco (VS Code editor) | larger bundle (~3 MB) | only if VS Code look is a must |
| Structure view as main view for business users, with glossary side panel | medium | if business users write themselves |
| Spreadsheet mode for Examples tables (paste from Excel) | small | useful addition to C |

**Please decide:** which variants go into M1, and whether the Code view stays a lightweight
textarea or moves to CodeMirror 6.
