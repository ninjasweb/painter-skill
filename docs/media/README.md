# Medios de la documentación

Selección de las iteraciones más recientes disponibles del proyecto de trabajo `painter`, realizada el 11 de noviembre de 2026. El proyecto sirve como evidencia del uso de la skill; sus carpetas de trabajo y motores duplicados no se incorporan al repositorio.

| Medio publicado | Fuente dentro del proyecto | Versión seleccionada |
| --- | --- | --- |
| `sunset-lake.jpg`, MP4 y GIF | `agent-test-8/sunset-lake.mp4` | MP4 corregido de las 22:26, hora local del proyecto. |
| `sunset-lake-timeline.jpg` | `agent-test-8/timeline-sheet.jpg` | Hoja actualizada a las 22:26. |
| `last-light.jpg`, MP4 y GIF | `agent-test-7/last-light.mp4` | MP4 final de las 17:51. |
| `blue-hour-lake.jpg` y MP4 | `agent-test-6/blue-hour-lake.mp4` | MP4 final de las 17:41. |
| `alps-morning.jpg` | `agent-test-9/stills/alps-morning/t008.00.png` | Último still disponible, 22:38. No había MP4. |
| `studies/*_study.jpg` | Imágenes publicadas en esta carpeta | Regeneradas con la versión de `tools/study.py` de esta skill. |

## Preparación

- Los posters de las tres animaciones se extrajeron en `duración − 1/30` del MP4 fuente, antes de comprimir el video. Así evitan depender de posters que pudieran haber quedado anteriores a una corrección.
- Los MP4 de documentación conservan resolución 1280 × 720, duración y 30 fps. Se recomprimieron con H.264, CRF 25, `yuv420p` y `faststart`. No son los masters originales.
- Los GIFs conservan la duración, a 640 px, 10 fps y 128 colores; usan una paleta calculada por ffmpeg y reproducción en bucle.
- Las tres láminas `study` se generaron a partir de los JPG publicados. Sus métricas corresponden a esos JPG, no a los masters PNG.
- El still de Alps Morning se convirtió a JPG manteniendo 1600 × 900.
- No se copiaron los estudios antiguos de `agent-test-8`, porque precedían al MP4 corregido.

Para regenerar los estudios desde la raíz del repositorio, con las dependencias Python instaladas:

```bash
python tools/study.py docs/media/sunset-lake.jpg \
  docs/media/last-light.jpg docs/media/alps-morning.jpg \
  --out docs/media/studies
```

Los ejemplos de la galería fueron producidos con copias de trabajo del motor durante el desarrollo. Este repositorio conserva la versión actual de la skill, que contiene ajustes posteriores. Las imágenes no se presentan como pruebas de equivalencia exacta con un nuevo render del motor publicado.
