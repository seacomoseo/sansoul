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

Desde `5.1.0`, README y AGENTS de la raíz son genéricos y se generan íntegramente desde `templates/root/`. Las particularidades pertenecen exclusivamente a `dna/`.

## 5.1.3 — 2026-07-27

**Impacto:** todos los proyectos que mantengan documentación en `dna/`.

### Cambios relevantes

- El contrato de agentes aclara que el ADN contiene solo identidad, audiencia, criterios editoriales, diseño, negocio, integraciones y excepciones propias del proyecto.
- El ADN no debe repetir arquitectura, flujos de trabajo, validaciones, seguridad ni uso genérico ya documentados en los README/AGENTS de la raíz o del tema.
- Toda petición de cambio reutilizable en README/AGENTS raíz debe aplicarse primero en `templates/root/` y regenerarse en el consumidor; las particularidades locales se redirigen al ADN.

### Acciones obligatorias

1. Ejecuta `sh do root-docs` para sincronizar el contrato raíz.
2. Revisa los documentos de `dna/` y elimina o sustituye por enlaces cualquier repetición de instrucciones genéricas de README/AGENTS.
3. Ejecuta el build completo y las comprobaciones proporcionales al proyecto.

### Validación

Una segunda ejecución de `sh do root-docs` no debe producir cambios. El ADN debe conservar únicamente contexto y restricciones propios del proyecto. Tras validar y ejecutar `sh do migrations mark --yes`, raíz y tema deben indicar `5.1.3`.

## 5.1.1 — 2026-07-23

**Impacto:** proyectos que todavía conservan README/AGENTS raíz no generados o un ADN sin completar.

### Cambios relevantes

- `sh do root-docs --force` reemplaza los documentos raíz antiguos sin copiar ni exigir que se traslade su contenido a `dna/`.
- Si falta `dna/_index.md`, el comando crea únicamente el scaffold del tema.
- Los agentes deben preguntar al usuario cuando el índice DNA falte, esté vacío o conserve solamente los textos orientativos.

### Acciones obligatorias

1. Ejecuta `sh do root-docs --force` si README/AGENTS todavía no son generados; su contenido anterior se descartará.
2. Completa `dna/_index.md` de forma independiente. No deduzcas particularidades desde los documentos reemplazados.
3. Ejecuta el build completo y las comprobaciones proporcionales al proyecto.

### Validación

Una segunda ejecución de `sh do root-docs` no debe producir cambios. El ADN no debe contener texto procedente de README/AGENTS antiguos. Tras validar y ejecutar `sh do migrations mark --yes`, raíz y tema deben indicar `5.1.1`.

## 5.1.0 — 2026-07-18

**Impacto:** todos los proyectos compatibles con `5.0.0`.

### Cambios relevantes

- Se incorpora el registro versionado de migraciones y la comparación entre los paquetes raíz y tema.
- README y AGENTS raíz pasan a generarse desde `templates/root/` mediante `sh do root-docs`.
- `dna/_index.md` pasa a ser la fuente obligatoria de identidad, particularidades y rutas documentales del proyecto.
- `sh do local` incorpora regeneración supervisada de la preconstrucción.

### Acciones obligatorias

1. Si los archivos raíz son antiguos, ejecuta `sh do root-docs --force`; si faltan o ya son generados, ejecuta `sh do root-docs` sin `--force`.
2. Define `dna/_index.md` independientemente; no copies ni deduzcas contenido desde README/AGENTS antiguos.
3. Revisa el diff y confirma que README/AGENTS solo contienen información genérica.
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
