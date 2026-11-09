# Zain Usmani — Portfolio

Computer vision, embedded systems and digital hardware. Single-page static site: no build step, no framework.

## Put it live on GitHub Pages

1. Create a repo named `Zain-Usmani10.github.io` (use your exact GitHub username).
2. Upload everything in this folder (`index.html`, `assets/`, `.nojekyll`, this README) to the repo root.
3. Repo → Settings → Pages → Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`.
4. The site is live at `https://Zain-Usmani10.github.io` within a minute or two.

## Editing

- **Text** for O-Hive, Formula Electric, research, skills and contact lives directly in `index.html`.
- **Projects** are in the `PROJ` array inside the `<script>` near the bottom of `index.html`. Each project has a title, date, one-liner, bullets, tools, and an optional list of images (`m`). Projects without images show a small diagram instead (`dg`).
- **O-Hive pipeline stages** are in the `STAGES` array in the same script.
- **Images** go in `assets/img/`. Add a file there, then reference it by name in a project's `m` list.
- The 3D point cloud in the hero is built in the browser from one real depth frame embedded in the page (`CLOUD` in the script).

Fonts (Space Grotesk, Inter, JetBrains Mono) load from Google Fonts.
