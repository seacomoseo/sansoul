# Ubicación y configuración del motor

La referencia copiable utiliza `core/` desde SanSoul 7.7.0. El motor continúa
admitiendo consumidores con `themes/sansoul/`: actualizar no obliga a moverlos.
El repositorio remoto y el commit instalado no cambian al renombrar la carpeta.

## Configuración derivada desde 8.0.0

El proyecto ya no necesita repetir `themesDir` y `theme` en su `hugo.yml`.
El wrapper encuentra el motor antes de invocar Hugo; el prebuild calcula los
selectores y los publica en su configuración generada:

| Motor ejecutado | `themesDir` | `theme` |
| --- | --- | --- |
| `core/` | `.` | `[core]` |
| `themes/sansoul/` | `themes` | `[sansoul]` |

La fuente es `prebuild/hugo.yml` y su generador; no edites
`prebuild/public/hugo.prebuild.yml`. El build principal carga esa salida antes
del `hugo.yml` del proyecto. Los valores explícitos del proyecto conservan su
prioridad, por lo que un selector personalizado necesita revisión antes de
cambiar la ruta del motor. El propio `core/hugo.yml` no puede descubrirse como
tema hasta que Hugo conozca su ubicación.

La migración `scripts/migrations/8.0.0-project-config.js`, registrada en
`sh do update`, elimina únicamente selectores conocidos que coincidan con el
motor ejecutado. Conserva comentarios y otros ajustes, ordena los parámetros
simples como `domain`, `owner`, `name` y sustituye el wrapper histórico reconocido
por uno compatible con las dos ubicaciones. Los wrappers personalizados, enlaces
simbólicos y configuraciones no reconocibles se conservan con un aviso de
revisión. La migración admite `--check`, es idempotente y no impone pnpm ni mueve
el submódulo.

## Otros consumidores: actualizar primero, mover después

Para conservar `themes/sansoul/`, usa `sh do update` normalmente. No hace falta
ningún cambio de ruta previo. La actualización aplica las migraciones automáticas,
regenera los documentos y valida el proyecto según su versión de origen; revisa
los avisos y las comprobaciones manuales que indique.

Si el motor instalado todavía no incluye el actualizador portable, primero hay
que hacer el bootstrap de ese proyecto: comprueba sus dos árboles Git, conserva
los cambios y actualiza el submódulo desde su rama configurada con
`git submodule update --remote themes/sansoul`. Si el wrapper raíz termina en
`$1`, descarta argumentos adicionales: para comprobar sin aplicar, ejecuta
`sh themes/sansoul/do update --check` directamente; después `sh do update`.
El wrapper actualizado ya admite `sh do update --check`. Los proyectos anteriores a 5.0 necesitan
antes la migración privada legada verificada mediante su antiguo `sh do update`;
el actualizador portable no sustituye ese paso.

### Comandos para un proyecto que conserva `themes/sansoul`

Estos comandos requieren que la versión nueva del motor ya esté disponible en
su remoto. Los cambios locales sin publicar de esta referencia todavía no
pueden llegar a otro proyecto mediante `git submodule update`.

Con ambos árboles limpios, desde la raíz del otro proyecto:

```sh
git status --short
git -C themes/sansoul status --short
sh do update --check
sh do update
```

Si su wrapper histórico solo transmite `$1`, usa la llamada directa para que
`--check` no se pierda:

```sh
sh themes/sansoul/do update --check
sh themes/sansoul/do update
```

Si ese motor aún no tiene el actualizador portable, una vez conservados los
cambios y verificada su rama configurada:

```sh
git submodule update --init --recursive
git submodule update --remote themes/sansoul
sh themes/sansoul/do update --check
sh themes/sansoul/do update
```

El bootstrap solo se admite cuando el avance es limpio y no ha divergido. Para
proyectos anteriores a 5.0, ejecuta primero su `sh do update` privado legado y
verifica la migración; los comandos anteriores no la sustituyen. No cambies
manualmente la versión raíz para eludir los controles del actualizador. Si
quedan verificaciones manuales, complétalas antes de `sh do migrations mark --yes`.
Cambiar a pnpm es opcional y se hace por separado.

Para cambiar también la estructura de un consumidor:

1. Actualiza y valida el motor **en su ruta anterior**. Detén los servidores,
   conserva un backup y resuelve los cambios pendientes de ambos árboles Git.
2. Revisa el wrapper raíz: el generado por la migración admite ambas rutas;
   si era personalizado, adapta sus referencias manualmente.
3. Cuando quieras registrar el movimiento, ejecuta
   `git mv themes/sansoul core`. **Este comando hace staging** y no forma parte
   de `sh do update`. No uses `git submodule add`: el submódulo ya existe.
4. Actualiza accesos directos, workflows y CI que invoquen scripts por su ruta.
   Elimina o adapta los selectores personalizados de Hugo que aún apunten al
   motor anterior. Los selectores derivados no necesitan cambios.
5. Ejecuta `sh do root-docs`, `sh do hugo` y las comprobaciones pertinentes de
   CMS, desarrollo, cierre y clon nuevo con submódulos.

El actualizador busca la subsección de `.gitmodules` por su valor `path`; su
nombre interno puede seguir siendo `themes/sansoul` aunque la ruta sea `core`.
El almacén `.git/modules/themes/sansoul` también puede conservar su nombre.
No publiques el padre antes de que los commits del motor estén disponibles en
su remoto. Ninguno de los comandos de migración hace commit, push o despliegue.

## Estado de esta referencia y reversión

El checkout de esta referencia se movió preservando los cambios pendientes; se
ajustaron `core/.git`, `core.worktree` y la ruta de `.gitmodules`. El índice raíz
no se modificó: Git puede mostrar la ruta anterior eliminada y `core/` como nueva
hasta que el usuario registre la migración. `git -C core status` permite revisar
el motor por separado.

Para revertir una ruta, detén los procesos y preserva primero los cambios.
Devuelve el checkout a `themes/sansoul/` y repara la ruta de `.gitmodules`, los
accesos directos y las dos referencias internas de Git. Con el motor actual,
el prebuild derivará de nuevo sus selectores; al volver también a un motor
anterior a 8.0.0, restaura su configuración explícita correspondiente.
Regenera documentos y valida. No restaures solo la carpeta dejando un gitfile
que apunte al nivel anterior.

La copia inicial de la migración de esta referencia está en
`/private/tmp/sansoul-core-migration-20261015`. Es temporal: conserva una copia
duradera para un rollback a largo plazo y no restaures su índice sobre staging
nuevo realizado después.
