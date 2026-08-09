# Radar BM · RAdarMonetario

## Actualizar Pronósticos de Banxico

El archivo maestro se conserva en `data/master/pronosticos_banxico_historico.xlsm`. Para regenerar el JSON web y el reporte de validación ejecute `npm run publish:forecasts`.

El proceso conserva vacíos como `null`, valida claves duplicadas y fechas ambiguas, diferencia decisiones efectivas/programadas/estimadas y genera `public/data/pronosticos-banxico.json` y `data/forecast-validation-report.json`. La correspondencia con Radar de Decisiones se valida por fecha exacta; una decisión sin correspondencia no recibe enlace.

Convenciones centrales: sesgo = pronóstico − observado; D0 es la última decisión efectiva anterior al cierre del trimestre; las cohortes son 2–4%, >4–5% y >5% y se configuran en el JSON generado.

Aplicación pública para comparar el perfil técnico e institucional de la Junta de Gobierno del Banco de México.

## Fuente de verdad

El libro `data/master/RAdarMonetario_Indice_Heath_FINAL_CORREGIDO_v20260729.xlsm` es la fuente autoritativa. La aplicación nunca lo modifica. El proceso `scripts/extract_workbook.py` produce `public/data/radar-bm.json`.

## Desarrollo

```powershell
python scripts/extract_workbook.py
npm install
npm run dev
```

## Publicación

Cada envío a `main` activa `.github/workflows/deploy.yml` y publica el sitio en GitHub Pages bajo `/RAdarMonetario/`.

## Estados

- **Observatorio:** estimaciones oficiales del proyecto.
- **Heath:** calificaciones históricas publicadas o reconstruidas, claramente identificadas.
- **Personalizada:** modificaciones temporales guardadas exclusivamente en `sessionStorage`.

Radar BM reconoce la metodología de evaluación publicada por Jonathan Heath. Las reconstrucciones, ampliaciones y calificaciones propias son responsabilidad exclusiva de RAdarMonetario.
