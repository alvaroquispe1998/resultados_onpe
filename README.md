# Dashboard Electoral ONPE (Segunda Vuelta)

Un dashboard en tiempo real para visualizar los resultados electorales de la segunda vuelta utilizando la API oficial de la ONPE. Este proyecto fue desarrollado para mostrar datos estructurados y actualizados directamente de los endpoints oficiales con una interfaz limpia, enfocada en la comparativa de candidatos y el registro de la evolución de votos.

## Características

- **Datos en Tiempo Real**: Se conecta a la API de la ONPE para obtener la lista de los candidatos y el progreso global de las actas contabilizadas.
- **Gráficos Dinámicos**: Muestra gráficos de la evolución de votos mediante Chart.js, almacenando en memoria y disco (en `history.json`) cómo varían los totales en cada porcentaje de actas.
- **Comparativa de Distancias**: Permite seleccionar candidatos para ver y calcular su brecha de votos actuales, indicando si la diferencia se amplía o se recorta frente a la actualización anterior.
- **Auto-refresco**: La interfaz hace _polling_ a los datos oficiales y se mantiene siempre actualizada sin necesidad de intervención manual.
- **Sin Dependencias Externas (Backend)**: El servidor fue creado en Vanilla Node.js utilizando únicamente los módulos nativos `http`, `https` y `fs`.

## Requisitos

- [Node.js](https://nodejs.org/) (versión v14+ recomendada).

## Instalación y Ejecución

Al ser un servidor vanilla sin dependencias externas, no es necesario ejecutar `npm install` si no deseas agregar nada extra. Simplemente clona este repositorio e inicializa el servidor:

```bash
# Iniciar el servidor local
npm start
```
*(Alternativamente, puedes usar directamente `node server.js`)*

El servidor quedará en ejecución de forma predeterminada en `http://localhost:3000`.

## Estructura del Proyecto

- `server.js`: Contiene tanto el servidor HTTP para servir los datos JSON parseados, como la interfaz web embebida.
- `package.json`: Archivo de configuración básica del proyecto.
- `history.json`: (Autogenerado) Funciona como base de datos local para persistir el historial de los votos conforme avanza el porcentaje de actas contabilizadas.

## API Local Embebida

Al levantar el proyecto, tendrás disponible el endpoint:
- `GET /api/results`: Retorna el estado global, historial registrado y el arreglo de candidatos junto a sus porcentajes en formato JSON para el dashboard.

## Notas

- Los encabezados (_headers_) de las peticiones en `server.js` fueron replicados desde una navegación real de un usuario común para asegurar la correcta comunicación con los servidores de la ONPE.
