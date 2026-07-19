# Migraciones de SanSoul

Este archivo registra únicamente cambios del tema que requieren revisar o modificar un proyecto consumidor. No sustituye al historial de Git ni pretende enumerar correcciones internas.

La versión publicada del tema vive en `package.json` y sigue [Semantic Versioning](https://semver.org/):

- **major**: incompatibilidad deliberada o migración obligatoria;
- **minor**: funcionalidad compatible; puede incluir una adaptación opcional;
- **patch**: corrección compatible sin cambios esperados en el proyecto.

El `package.json` del tema declara la versión instalada y el `package.json` de la raíz declara la última versión con la que el proyecto es compatible. Después de actualizar el submódulo, `sh do migrations` compara ambos valores y muestra las secciones pendientes.

## Flujo de actualización

```sh
# Después de actualizar themes/sansoul
sh do migrations

# Tras aplicar las acciones indicadas y validar el proyecto
sh do migrations mark --yes
```

`sh do migrations check` termina con error mientras las versiones difieran, aunque una actualización compatible no tenga acciones documentadas. `mark --yes` actualiza la versión de `package.json` y `package-lock.json` en la raíz. Nunca lo ejecutes antes de realizar las acciones y validar el build.

## Cómo añadir una migración

Añade una sección `## x.y.z — fecha` por cada versión que requiera intervención. Indica:

- **Impacto**: qué proyectos están afectados;
- **Acciones obligatorias**: pasos concretos, comprobables y en orden;
- **Automatización**: script idempotente disponible, si existe;
- **Validación**: resultado que demuestra compatibilidad.

Si una transformación puede automatizarse con seguridad, colócala en `scripts/migrations/` y enlázala desde la sección. No ejecutes migraciones automáticamente durante `hugo`, `server`, `local` ni al actualizar el submódulo.

Desde `5.1.0`, README y AGENTS de la raíz son genéricos y se generan íntegramente desde `templates/root/`. Las particularidades pertenecen a `dna/`. En una primera adopción, revisa los archivos antiguos y traslada la información útil antes de permitir su reemplazo con `sh do root-docs --force`.

## 5.1.0 — 2026-07-18

**Impacto:** todos los proyectos compatibles con `5.0.0`.

### Cambios relevantes

- Se incorpora el registro versionado de migraciones y la comparación entre los paquetes raíz y tema.
- README y AGENTS raíz pasan a generarse desde `templates/root/` mediante `sh do root-docs`.
- `dna/_index.md` pasa a ser la fuente obligatoria de identidad, particularidades y rutas documentales del proyecto.
- `sh do local` incorpora regeneración supervisada de la preconstrucción.

### Acciones obligatorias

1. Revisa README/AGENTS antiguos y traslada toda particularidad útil a `dna/_index.md` o a documentos enlazados desde él.
2. Si los archivos raíz son antiguos, ejecuta `sh do root-docs --force`; si faltan o ya son generados, ejecuta `sh do root-docs` sin `--force`.
3. Revisa el diff y confirma que README/AGENTS solo contienen información genérica y que el ADN conserva el contexto propio.
4. Ejecuta el build completo y las comprobaciones proporcionales al proyecto.

### Validación

Una segunda ejecución de `sh do root-docs` no debe producir cambios. Tras validar y ejecutar `sh do migrations mark --yes`, `sh do migrations check` debe indicar que raíz y tema están en `5.1.0`.

## 5.0.0 — línea base

**Impacto:** proyectos anteriores a la línea base `5.0.0`.

### Acciones obligatorias

1. Si el proyecto todavía depende de las migraciones encadenadas del actualizador privado, ejecuta `sh do update` antes de sustituir su tema antiguo.
2. Lleva el proyecto a la estructura funcional de la línea base `5.0.0` y confirma que compila correctamente antes de aplicar migraciones posteriores.
3. Conserva el actualizador privado únicamente como puente hasta que todos los proyectos heredados alcancen esta línea base.

### Validación

`sh do hugo` debe finalizar correctamente en la línea base antes de continuar con versiones posteriores.
