# Agent instructions for the SanSoul theme

## Scope

These instructions apply to `core/`. This directory is a shared Git submodule and a separate repository. A change here can affect every consumer that updates the submodule.

The same engine supports existing consumers installed at `themes/sansoul/`.
Resolve the executing engine path; do not assume its directory depth.

Read `templates/root/AGENTS.md` first: it is the canonical consumer contract copied to every project root. Theme behavior must preserve that contract. Check Git status in both repositories before editing and preserve all existing user changes.

## Hard rules

- Do not commit, push, publish, update the parent submodule pointer, or deploy unless explicitly requested.
- Write code, identifiers, and code comments in English.
- JavaScript is ESM and follows StandardJS: two spaces, single quotes, no semicolons.
- Keep shell commands POSIX-compatible because the root invokes them with `sh`.
- Never hand-edit generated files in `prebuild/public/`, root `public/`, root `resources/`, or generated CMS output.
- Do not remove public shortcodes, render hooks, types, sections, or partials solely because the reference site does not exercise them.
- Do not expose credentials in theme defaults, examples, CMS configuration, logs, or documentation.
- Preserve `_examples/content/page/divisores.es.md`; it is the shared divider regression fixture.

## Design intent

SanSoul is a data-driven Hugo page builder. Consumer projects should normally customize `content/`, `data/`, root assets, and uploads instead of copying theme layouts.

The theme owns four coupled systems:

1. prebuild-time configuration and main-build content adapters;
2. runtime template composition and rendering;
3. generated Sveltia CMS schema;
4. processed CSS, JavaScript, fonts, icons, and images.

A parameter change can affect all four. Trace the parameter from author-facing YAML through prebuild/CMS generation to the rendering partial and final asset behavior before renaming or removing it.

## Theme pipeline ownership

The consumer-facing lifecycle is defined in `templates/root/AGENTS.md`. Internally, the root `do` wrapper executes `core/do`:

```text
project data/content
  -> prebuild Hugo site
  -> prebuild/public/hugo.prebuild.yml
  -> main Hugo build with static mounts and content adapters
  -> generated public site and manifests
  -> scripts/imgs.js post-processing
```

Configuration precedence is theme default, optional environment config, generated prebuild config, then project `hugo.yml`.

The prebuild owns configuration derived from languages, types, defaults, and collection-index metadata. The root content adapter creates section pages and pages from remote sources during the main build. `sh do live` serializes prebuild regeneration, publishes valid config atomically, and restarts Hugo for a full build after a successful refresh. Failed prebuilds preserve the last valid config; known refresh-time server failures recover on the next valid refresh. Plain `sh do dev` still requires a manual restart for prebuild inputs.

Video metadata refreshes before the prebuild. Both development supervisors also
watch referenced local videos and content/data references without restarting
Hugo. `data/video_metadata.json` is public, versioned source; preserve its manual
`overrides`. The generated statistics under `resources/` are disposable. Keep
provider credentials in the environment and never infer unavailable video facts.

## Directory responsibilities

- `prebuild/`: nested Hugo generator. Its `public/` directory is generated.
- `layouts/`: public rendering API, CMS generator, shortcodes, render hooks, schemas, and generated-file templates.
- `data/`: theme defaults and authoring metadata.
- `content/`: root content adapter and translated fallback/system pages.
- `i18n/`: UI translations and default semantic values.
- `assets/css/`: site and CMS SCSS.
- `assets/js/`: browser ESM modules.
- `assets/scripts.js`: main browser module graph.
- `scripts/`: Node build utilities and repository automation.
- `_examples/`: copyable integration fixture plus human/agent parameter references.

## Page builder implementation

The public composition semantics are defined in `templates/root/AGENTS.md` and demonstrated by `_examples/`. Internally, effective templates are merged by `func/tpls.html` and expanded by `func/tpl-sections.html`.

`tpl.section[0]` applies to every explicit section. Later `tpl.section` entries apply cyclic positional defaults. `tpl.sections` contains the concrete list and wins at the specific-section layer.

Render flow:

```text
baseof -> tpl-sections -> sections/merged-* -> sections/item
       -> boxes/items -> boxes/item -> blocks/* or nested boxes/items
```

`boxes/item.html` is a dispatcher. Specialized data contracts include:

- `list` -> `blocks/list`;
- `step` + `steps` -> `blocks/steps`;
- `gallery` + `imgs|limgs` -> `blocks/gallery`;
- `faq` + `faqs` -> `blocks/faq`;
- `review` + `reviews` -> `blocks/reviews`;
- `form` + `inputs` -> `blocks/form`;
- `map` + `geos` -> `blocks/map`;
- `links`, `dots`, `when`, and `gss` -> direct block partials;
- `boxes` -> recursive `boxes/items`.

Preserve key ordering behavior in `sort`, conditional behavior in `if`, page/global lookup behavior in `get`, and move/copy/remove behavior in `remap`.

## Hugo template practices

- Write YAML booleans as `true` or `false`. Hugo 0.164 and later treat unquoted
  `y` and `n` as strings and reject them for boolean configuration fields.
- Pass a `dict` to partials with more than one input. Use stable, descriptive keys.
- Keep one final `return` in value-returning partials for compatibility with the supported Hugo 0.164 baseline. Hugo 0.166 and later support conditional and multiple returns; do not assume the older unconditional-return behavior when running newer Hugo.
- Distinguish absent, empty, and false values intentionally; do not replace nil-sensitive logic with `default` without checking boolean semantics.
- Use `with` only when empty values should be treated as absent.
- Keep dynamic partial names constrained to known directories and document the mapping.
- Use `partialCached` only for pure partials and include every varying input in the cache key.
- Treat `page.Store`, `hugo.Store`, `resources.GetRemote`, `resources.ExecuteAsTemplate`, and file generation as side effects requiring contract documentation.
- Use `warnf` or `errorf` with actionable context for invalid author data. Do not silently convert a corrupt required value into unrelated output.
- Avoid formatting-only rewrites of large templates; whitespace control changes rendered HTML.

## Partial contract comments

Add a contract comment to non-trivial or reusable partials, especially functions and dispatchers:

```go-html-template
{{/*
Partial: func/example
Purpose: Resolve one value without rendering markup.
Context:
  - Page (page.Page, required): Current page.
  - name (string, required): Dot-delimited parameter path.
Returns: Any value, or nil when no value exists.
Side effects: None.
Example: {{ $value := partial "func/example" (dict "Page" . "name" "org.mail") }}
*/}}
```

For rendering partials use `Renders:` instead of `Returns:`. For scalar context, state `Context: string`, `page.Page`, or the actual type. Include defaults or accepted values only when they are not obvious from the code or examples.

Do not add comments that merely narrate assignment, iteration, or condition syntax.

## CMS generator practices

`layouts/partials/cms/` generates public YAML for Sveltia CMS. Source labels and help text live in `data/cms/<lang>.yml`; reusable options live in `data/options.yml` and `data/utilities.yml`.

When adding or changing an author-facing parameter:

1. update rendering/default logic;
2. update Spanish and English CMS labels/hints;
3. update options and custom field generation if applicable;
4. regenerate and parse `public/admin/config.<hash>.yml`;
5. create or edit representative content in `/admin/`;
6. update `_examples/` and documentation.

Sveltia fields are required by default. Emit `required: false` only when an empty value is supported. Keep generated field and collection names stable, unique, and free of dots or spaces.

CMS visual groups are declared as metadata on flat fields using `cms/group`.
Use `cms/fields` to combine mixed segments; Go slice types can make `append`
nest arrays. The runtime adapter owns native objects, format registration and
preview path mapping. Never persist virtual group keys or depend on Sveltia's
internal HTML/CSS. See `docs/cms-field-groups.md` for limits and the central flag.

## JavaScript practices

- Modules export named initialization functions; importing a reusable module should not mutate the page.
- Initialization must be a safe no-op when matching DOM does not exist.
- Scope selectors to the component and preserve progressive enhancement.
- Guard optional globals such as analytics, maps, players, MathJax, and CMS APIs.
- Handle promise rejections with useful context. Do not leave debug logs in normal production paths.
- Avoid rebuilding behavior already available through semantic HTML or CSS.
- Keep DOM state classes synchronized with their SCSS definitions.
- Do not use CommonJS in this ESM package.

After JavaScript changes, run syntax checks for every module and exercise affected interactions in the browser, including absent-component and repeated-initialization cases.

Production component selection is defined by `files/component-usage.html` and
the whole-module maps in `files/script-entry.html`/`files/style-groups.html`. Selective production uses
`js.Batch` shared chunks and ordered CSS segments from one Sass compilation.
Reusable Batch modules import shared configuration from `@params/config`; keep
full/development `js.Build` configuration compatible. CSS segmentation must
preserve the compiled cascade exactly and must not duplicate Sass side effects. Inspect every selector and
initializer sharing an optional module before pruning it. Use distinct resource
paths derived from complete source/options; shared temporary names can mix pages.
Keep development complete and preserve conservative custom-integration fallback.
Small CSS segments may be inlined only in their original cascade position;
retain the central opt-out and keep relative-resource segments external.
The full CMS receiver is loaded by a same-origin, token-gated bootstrap.

## SCSS practices

- Keep two-space indentation and the existing component hierarchy.
- Prefer shared tokens, functions, mixins, and utilities over duplicated literal values.
- Preserve accessibility states: focus visibility, reduced motion where relevant, color contrast, and usable touch targets.
- Coordinate responsive behavior with `*_vs` and layout parameters exposed to authors.
- Avoid broad selectors in project/CMS styles that can leak into rendered content.
- Validate both site and CMS bundles when shared tokens or widgets change.

## Node and shell scripts

- Build scripts must fail with a non-zero exit code when a required phase fails.
- Await asynchronous work before process exit and aggregate failures clearly.
- Limit destructive operations to explicit generated directories; never derive recursive deletion targets from unchecked input.
- Quote shell variables and support a missing first argument without test errors.
- Keep optional private tooling commands separate from the portable build path.
- Root-relative assumptions must be stated at the top of each script.

## SEO, schema, and generated files

Changes under `head.html`, `schema/`, or `files/` require representative tests for home, list, single, translated, noindex, and 404 pages. Verify canonical URLs, alternates, dates, images, JSON-LD validity, redirects, search index, robots, and llms output as applicable.

Generated files are outputs, not source. Fix their partials or data inputs.

## Compatibility and public APIs

Treat these as public theme APIs unless proven otherwise:

- author-facing data keys and accepted values;
- content/front matter conventions;
- section/type names;
- shortcodes and render hooks;
- CSS hooks used by project customizations;
- CMS field names and stored output;
- root `sh do` commands.

For a breaking change, increment the major theme version, add an actionable entry to `MIGRATIONS.md`, and update affected examples and documentation. Compatible features increment minor; compatible fixes increment patch. Do not perform broad renames as incidental cleanup.

`--printUnusedTemplates` is advisory only: dynamic calls and consumers outside this fixture produce false positives.

## Required validation

Establish a baseline before theme edits. From the project root, use the declared
manager (`npm ci` for an npm consumer or the following for a pnpm consumer):

```sh
pnpm install --frozen-lockfile
sh do hugo
```

For theme changes, also run:

- `node --check` for all changed JavaScript modules;
- `sh -n` for changed shell scripts;
- a build using `_examples/data` and `_examples/content`;
- browser checks for affected pages and `/admin/` when relevant;
- the copied `_examples/` divider page and any divider reference identified by the consumer DNA.

Use Hugo diagnostics such as `--printPathWarnings`, template metrics, and unused-template reports for investigation, not as deletion authority.

Restricted networks may produce remote-font warnings. Report them separately. A missing package, template failure, invalid generated YAML, failed image conversion, or successful shell exit after an internal error is a build failure that must be fixed.

## Documentation boundary

READMEs are Spanish human guides; AGENTS files are concise English operational contracts, not translations. Update only the document whose audience or contract changed:

- root README/AGENTS templates: generated consumer onboarding and operating contract;
- `README-ROOT.md`: detailed human use of the theme from a project;
- `README.md` / this file: theme implementation and maintenance.

Consumer DNA is project-specific context, not a second operating manual. Keep the root AGENTS template explicit that agents must check root and theme README/AGENTS before expanding DNA, must not duplicate their generic rules there, and should link to the canonical document when context is useful.

Treat a request to change a consumer root README or AGENTS file as a shared template change unless the requested information is clearly project-specific. For shared changes, edit the corresponding file under `templates/root/` first and run `sh do root-docs` in the reference project; never patch only the generated consumer file. Route project-specific information to DNA instead.

Avoid exhaustive parameter tables in instructions. Keep `_examples/` as the copyable fixture and executable parameter reference.

Perform a documentation and migration impact check after every implementation change without waiting for an explicit request. When behavior, commands, public parameters, file structure, requirements, or agent rules change, update the relevant source of truth in the same task. Do not edit unrelated documents merely to keep artificial pairs synchronized.

After changing either root template, include the regenerated root file in the same change.
