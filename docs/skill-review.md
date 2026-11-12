# Revisión de painterly-video

Revisión de publicación: 11 de noviembre de 2026. El objeto de esta revisión es la skill de este repositorio. Los trabajos externos se consultaron para seleccionar muestras recientes de su uso.

## Evaluación

La principal fortaleza es la conexión entre el criterio pictórico y una implementación ejecutable. `SKILL.md` establece composición, valores, paleta, orden de capas y revisión visual. Las referencias explican cómo traducirlos a funciones concretas; el motor entrega pinceladas, textura, reveal y movimiento. `study.py` aporta una manera reproducible de inspeccionar las decisiones.

La estructura funciona bien como skill: un punto de entrada, documentación por tema, escenas iniciales y herramientas. Las referencias están separadas del flujo general y los ejemplos son ejecutables. La galería del README muestra trabajos recientes, mientras que `examples/` conserva las seis escenas originales de partida.

## Ajustes de publicación

| Hallazgo | Ajuste |
| --- | --- |
| Node ≥18 en la documentación y el paquete, pero Puppeteer 25.17.0 requiere ≥22.12.0. | Requisito alineado en `SKILL.md`, `package.json`, lockfile y README. |
| Dependencias JavaScript sin lockfile en la skill. | Se incorporó el lockfile de la instalación del proyecto que coincide con las dependencias declaradas; instalación documentada con `npm ci`. |
| Setup vinculado a una ubicación de instalación concreta. | Ruta configurable en el ejemplo de `SKILL.md`, con explicación de cómo resolverla. |
| Dependencias de `study.py` implícitas. | `tools/requirements.txt` y ejemplo con entorno virtual. |
| Imagen final y study de Sunset Lake anteriores al último MP4 corregido. | Poster extraído del último MP4 y study regenerado con la herramienta de esta skill. |
| Faltaba documentación pública del conjunto. | README con instalación, proceso, galería reciente, studies, GIFs, MP4 y enlaces a las referencias. |

Se conservaron los cambios ya presentes en el motor. No se sustituyó por una copia anterior del proyecto de ejemplos.

## Comprobaciones

- Construcción de las seis escenas base en Node.js 22.22.0, sin renderizar: número de pinceladas positivo, datos finitos y mismas pinceladas al repetir la semilla.
- Validación de estructura y frontmatter de la skill.
- Ejecución de `study.py` sobre tres imágenes de la galería; inspección visual de posters y láminas.
- Análisis de los tres MP4 comprimidos mediante el CLI de esta skill: resolución, duración, conteo de frames, cambios bruscos y segmentos negros.
- Inspección de enlaces locales, estructura de publicación y exclusión de dependencias instaladas, entornos, archivos privados y motores duplicados.

### Límites de esta comprobación

La instalación nueva desde npm no pudo completarse en el entorno de publicación por un error de resolución de `registry.npmjs.org`. La verificación local utilizó dependencias ya instaladas en el proyecto, con versiones coincidentes con el lockfile.

El intento de render nuevo se detuvo al abrir el servidor local: el entorno restringido devolvió `listen EPERM` en `127.0.0.1`. Por tanto, esta publicación no afirma haber realizado un render completo nuevo en WebGPU ni validado la instalación desde cero. Los videos son entregables existentes, procesados y revisados para la documentación.

## Límites funcionales y mejoras posibles

- **Plataformas:** el flujo se desarrolló en macOS/Apple Silicon. Las rutas y flags para Linux/Windows necesitan pruebas de GPU y codecs en esos sistemas.
- **Métrica focal:** el mapa combina contraste local y croma. Es una heurística visual, no un modelo validado de atención humana.
- **Reglas artísticas:** horizontes fuera del centro, masas desiguales y límites de croma son criterios de partida. Una intención explícita de simetría, estilo gráfico o color intenso debe prevalecer.
- **QA:** `ok` no evalúa composición. Los frames congelados se reportan, pero no hacen fallar el informe por sí solos. El CLI imprime el resultado y no establece un exit code distinto cuando `ok` es falso; una integración debe leer el JSON.
- **Robustez del estudio:** imágenes uniformes pueden provocar divisiones por cero en el mapa focal; imágenes extremadamente panorámicas pueden dejar menos de 6000 píxeles para el muestreo sin reemplazo. Son casos pendientes de endurecer; no se observaron en las láminas publicadas.
- **Servidor de preview:** está limitado a loopback y pensado para archivos locales de confianza. Antes de ofrecerlo como servicio compartido convendría restringir explícitamente las rutas servidas y endurecer el manejo de errores.
- **Reproducibilidad:** una semilla fija estabiliza las pinceladas; cambios de motor, navegador, GPU o codificador pueden modificar los resultados. La galería conserva procedencia y versiones de medios, sin prometer igualdad de píxeles con el motor actual.
- **Licencia:** se mantiene la licencia MIT del componente vendorizado `spectral.js`. El propietario todavía no ha indicado una licencia general para el resto del repositorio.
