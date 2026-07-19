# Agent instructions for SanSoul examples

This directory is both a copyable integration fixture and the public parameter reference for the theme.

## Invariants

- Keep `data/` and `content/` directly copyable into a consumer project root.
- Do not add secrets, private endpoints, personal data, or environment-specific absolute paths.
- Prefer deterministic local fixtures. Remote public assets may demonstrate remote handling but must not be required for a successful build.
- Keep `content/page/divisores.es.md`; it is the divider visual regression fixture.
- Reference pages such as components and dividers should remain `noindex`.
- Use stable historical dates unless the feature explicitly depends on future or current dates.

## Source-of-truth role

When an author-facing parameter changes, update the smallest valid example here together with rendering logic, CMS fields, translations, defaults, and documentation. `data/section/example.yml` is the broad parameter catalog; focused files should demonstrate realistic compositions rather than repeat every option.

## Validation

Test these files by copying `data/` and `content/` into a temporary consumer project that also has the standard `uploads/base/` fixtures. Run the full `sh do hugo` pipeline, inspect generated CMS configuration, and open `/componentes/`, `/divisores/`, representative collection pages, and `/admin/`.

Do not edit generated `prebuild/public/` or `public/` output to make the fixture pass.
