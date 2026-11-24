---
id: readme-language-layout
type: documentation-contract
status: active
source_commit: 6f5456e59e4879810fbea511b484496eca89a093
related:
  - ../../README.md
  - ../../README.en.md
  - ../../tools/assert-readme-languages.mjs
---

# README language layout

## Goal and scope

Make the complete existing English README independently accessible without
removing Chinese documentation or breaking the original English entry point.
This is a documentation split, not a translation refresh or runtime change.

## Contract

- [Chinese README](../../README.md) remains the default repository landing page.
- [English README](../../README.en.md) contains the full original English section.
- Both documents offer language navigation. The original Chinese README's
  English heading remains as a compatibility landing point for old bookmarks.
- Keep the English README in the package files allowlist so the language link
  also works in the published package.
- Update the relevant language document when changing documentation; existing
  translation differences are not corrected by this structural change.

## Provenance and verification

The split uses upstream commit
`6f5456e59e4879810fbea511b484496eca89a093`. The original Chinese and English
bodies were compared after normalizing line endings; both were preserved.
The new English introduction, language navigation, and contributor footers are
additions. Existing images and relative documentation links remain unchanged.

Run `node tools/assert-readme-languages.mjs` for navigation, local-link targets,
required sections, and the packaging allowlist. Run `npm test` for the offline
assertion suite and `npm pack --dry-run --json` to inspect packaged files.
The language assertions are automatically discovered by the existing test runner.

## Contributor contact

**[chirag@oriz.in](mailto:chirag@oriz.in)**

<footer class="hire-me">
    <h3>Hire me</h3>
    <p>Chirag Singhal — building free, open APIs and tools.</p>
    <p>
        <a href="mailto:chirag@oriz.in">chirag@oriz.in</a> ·
        <a href="https://github.com/chirag127">GitHub</a> ·
        <a href="https://www.linkedin.com/in/chirag127/">LinkedIn</a> ·
        <a href="https://x.com/singhal127">X</a> ·
        <a href="https://www.youtube.com/@ChiragSinghal127">YouTube</a> ·
        <a href="https://www.instagram.com/chiragsinghal127/">Instagram</a> ·
        <a href="https://www.reddit.com/user/Far_Macaron_9910/">Reddit</a> ·
        <a href="https://buymeacoffee.com/chirag127">Buy me a coffee</a>
    </p>
</footer>
