# SanSoul Theme Core Documentation

> - **Role**: Core Logic & Design System
> - **Location**: `themes/sansoul/`
> - **Status**: SHARED SUBMODULE (Do not modify without explicit intent to update all projects)

## system.summary
This submodule drives the build pipeline, configuration, and rendering logic for SanSoul-based sites. It uses a "Prebuild + Build" strategy to overcome Hugo's static limitations, enabling dynamic configuration, module mounting, and complex data-driven layouts.

## guidelines.strict_rules
1.  **Language**: All code, comments, and variable names must be in **English**.
2.  **Style Guide**: Follow **StandardJS** (no semicolons, 2 space indent, single quotes).
3.  **Module System**: Use **Node.js with ESM** (`import`/`export`) for all JS.
4.  **Naming**: Variable names must be elegant, legible, and scalable.

## guidelines.tech_stack
- **Core**: Hugo (Extended), Node.js (ESM), Shell (`sh`).
- **CMS**: Sveltia CMS.
- **Styles**: SCSS, PostCSS.
- **Libraries**: `material-symbols`, `@fortawesome/fontawesome-free`, `sharp`.

## system.build_pipeline
The build is controlled by `./do` which invokes `themes/sansoul/do`.

### Basic Commands
- **Dev Server**: `sh do server` (Regenerates prebuild config).
- **Production**: `sh do hugo`.

### 1. Prebuild (`themes/sansoul/prebuild/`)
A nested Hugo instance runs *before* the main build.
- **Input**: `data/types/`, `data/langs.yml`, `data/remote.yml`.
- **Logic**: `layouts/partials/files-by-config.html`.
- **Output**: `themes/sansoul/prebuild/public/`.
  - `hugo.prebuild.yml`: The compiled configuration file.
  - `content/`: Generated index pages and content types.

**Critical Caveat**: Changes to `data/remote.yml`, `data/types/`, or global `config.yml` require a **restart** of the server (`sh do server`). Hot-reload *does not* catch these.

### 2. Module Mounting
The prebuild process determines where files live. Key mounts in `hugo.prebuild.yml`:
- `content/single/_home.{lang}.md` -> `content/_index.{lang}.md`.
- `content/values.{lang}.yml` -> `data/values.{lang}.yml`.
- `uploads/` -> `static/u/` AND `assets/u/`.
- Node modules -> `assets/fonts/` or `assets/u/icons/`.

## system.tpl_logic (The "Page Builder")
Pages are not standard Hugo templates. They are "assembled" using a recursive logic determined by the `tpl` object.

### TPL Definition Source
- **Standard Pages**: `tpl` is defined in `data/types/{type}.yml` (e.g., `data/types/page.yml`).
- **Single Pages**: `tpl` is defined in the **Front Matter** of the page itself (e.g., `content/single/example.es.yml`).
- **Defaults**: `data/types/all.yml` defines global defaults for all types.

### The Render Tree
- **Tree**: `baseof` -> `tpl-sections` -> `merged-expand` -> `boxes/item.html`.
- **Recursion**: `boxes/item.html` parses keys (`img`, `title`, `steps`, `gallery`) and calls block partials.
- **State**: `page.Store` is used to pass flags (e.g., `is_container`) down the tree.
- **Dynamic Imports**: `assets/scripts.js` imports JS modules only when specific blocks are present in the DOM.

### Component Mapping (Keys -> Partials)
The `boxes/item.html` parser maps keys to specific partials. This is strict. Examples:
- **`boxes`** -> `boxes/items` (Recursive container)
- **`steps`** -> `blocks/steps` -> `item` (step)
- **`imgs` / `limgs`** -> `blocks/gallery`
- **`faqs`** -> `blocks/faq` -> `item` (faq)
- **`reviews`** -> `blocks/reviews` -> `item` (review)
- **`inputs`** -> `blocks/form`
- **`geos`** -> `blocks/map`
- **`modals`**: Hidden sections triggered via URL anchor (ID match).
- **Global Values**: `data/values.{lang}.yml` (source: `content/values.{lang}.yml`) supplies global params like `menu` or `callnow`.

### Components & Boxes
- **Hierarchy**: Sections > Boxes > Blocks and Sub-Boxes.
- **Blocks**: Complex elements (lists, galleries, forms).
- **Configuration Keys**:
  - `boxes` -> `box`
  - `list` -> `box`
  - `steps` -> `step`
  - `imgs` / `limgs` -> `gallery`
  - `faqs` -> `faq`
  - `inputs` -> `form`
  - `geos` -> `map`
  - `reviews` -> `review`
  - *Blocks without specific item key*: `gss`, `dots`, `when`, `links`.
- **Modals**: Sections can contain `modals` (hidden sections triggerable via URL anchor). **Configuration Keys**: `modal`.

### Configuration & Data (`./data/`)
- `config`: General config.
- `styles`: General style variables.
- `langs`: Language definitions and translation layers.
- `defaults`: Parameter defaults by path.
- `customs`: CMS custom fields/widgets.
- `remote`: Remote data fetching configuration.

### ⚠️ Cascade & Merge Logic (Deep Dive)
The system uses a sophisticated deep-merge strategy to determine parameters (e.g., background color). It merges global defaults, type defaults, and page specifics.

**Example: Determining the background color of the 2nd section in a "single" page:**
*(Priority Order: 1 = Lowest, 7 = Highest/Win)*

1.  `data/types/all.yml` -> `tpl.section[0].color` (Global Base)
2.  `content/single/all.{lang}.yml` -> `tpl.section[0].color` (Language Base)
3.  `data/types/single.yml` -> `tpl.section[0].color` (Type Base)
4.  `data/types/single.yml` -> `tpl.section[1].color` (Type N-th Base)
5.  `content/single/example.{lang}.yml` -> `tpl.section[0].color` (Page Base)
6.  `content/single/example.{lang}.yml` -> `tpl.section[1].color` (Page N-th Base)
7.  `content/single/example.{lang}.yml` -> `tpl.sections[1].color` (Specific Section - **WINNER**)

**Note on `section` vs `sections`**:
- `tpl.section`: Array of default values. Index `0` merges to ALL sections. Index `n` merges to every n-th section (modulo).
- `tpl.sections`: The actual array of explicit sections for the page.

## system.structure_map
Standard project structure emphasizing the separation of content (project) and logic (theme):
```
.
├── assets/                 # Project overrides (_custom.scss, customs.js)
├── content/                # Site Content (Flat structure: /type/page.md)
├── data/                   # The "Brain" (Config, Types, Langs)
├── themes/
    └── sansoul/            # CORE SUBMODULE
        ├── assets/         # Core JS/SCSS
        ├── layouts/        # Logic Core (TPL System)
        └── prebuild/       # Pre-generation logic
```
