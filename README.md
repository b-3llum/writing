# writting

A small, public notebook for essays, experiments, and unfinished thoughts.
Published at <https://yap.bellums.org/writting/> and linked from
<https://bellums.org/writing>.

## Write a post

1. Add a Markdown file to `posts/`. Images go in `posts/Attachments/` and are
   referenced relative to the note, the way an Obsidian vault stores them:
   `![](Attachments/Pasted%20image%2020260608211427.png)`.
2. Start it with frontmatter for `title`, `date`, `reading`, `description`,
   and optional `tags` (comma-separated, e.g. `tags: ctf, linux, privesc`).
   `date` should be a real date (`September 10, 2026`); notes are sorted by it
   and grouped by year. Tags become the sidebar filter pills, and everything
   (title, description, tags, body) is searchable from the box on the index.
3. Add the post file to the `posts` array in `app.js`.
4. Markdown, LaTeX between `$...$` or `$$...$$`, fenced code blocks, tables,
   and regular Markdown images are supported. A literal dollar sign in prose
   is written `\$`.
5. Regenerate the feed and bump the cache stamp before deploying:

   ```sh
   node tools/build-feed.mjs                 # rebuilds feed.xml from posts/
   # then bump ?v=<stamp> on styles.css/theme.js/app.js in index.html
   ```

   `feed.xml` is a committed Atom feed (there is no build server). `og.png`
   is the static link-preview card referenced from `index.html`; regenerate
   it only if the site name or tagline changes.

For a local preview, run:

```sh
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## How it is served

- GitHub Pages builds the `main` branch of this repo and serves it under
  `yap.bellums.org/writting/` (the `yap.bellums.org` CNAME lives in the
  `b-3llum.github.io` repo; Cloudflare proxies the domain).
- `.nojekyll` must stay. Without it GitHub runs Jekyll, which turns every
  `posts/*.md` with frontmatter into an `.html` page and stops serving the
  raw `.md` files that `app.js` fetches, so the index shows only the
  "notes could not be loaded" notice.
- No third-party scripts. `vendor/` holds pinned copies of marked 18.0.12,
  DOMPurify 3.4.15, and MathJax 3.2.2 (bundle, CHTML fonts, and a11y
  helpers). Licenses sit alongside.
- Fonts mirror bellums.org exactly so the two sites read as one: VT323 for
  the wordmark/headings, Pontano Sans for body, DejaVu mono for code, set via
  the `--term`/`--sans`/`--mono` variables in `styles.css`. VT323 and Pontano
  Sans load from Google Fonts (the same `<link>` bellums.org uses); keep the
  variables and the sizes in step with bellums.org's `static/base.css`.
- Cache-busting: `styles.css`, `theme.js`, and `app.js` are referenced with
  a `?v=<stamp>` query in `index.html`. GitHub/Cloudflare cache these first-
  party files for hours, so **bump the stamp on every deploy that changes
  them**, or returning visitors keep the stale copy. `index.html` and the
  `posts/*.md` are short-lived (10 min) and self-heal; `vendor/*` is pinned
  and stays unversioned. (This is why a note once appeared to be "missing":
  visitors held an old `app.js` whose `posts` list predated it.)
- `styles.css` and `theme.js` are ported from bellums.org's `static/base.css`
  and `static/theme.js`; keep them in step when the main site's skin changes.
