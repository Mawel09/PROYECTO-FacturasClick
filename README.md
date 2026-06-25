# ThalassaCRM - Mini CRM Visual y Tablero de Leads

**ThalassaCRM** es una aplicación web interactiva, moderna e intuitiva diseñada para que las empresas gestionen sus clientes o leads de forma visual a través de un tablero Kanban interactivo.

El diseño está optimizado para ofrecer una experiencia estética y premium: fondo blanco limpio con acentos azul marino profundo, bordes ovalados muy redondeados, sombras suaves y micro-interacciones fluidas.

---

## 🚀 Características Principales

- **Tablero Kanban Interactivo**: Mueve leads a través de sus distintas fases:
  - `Nuevo` ➔ `Contactado` ➔ `Propuesta Enviada` ➔ `Ganado` ➔ `Perdido`
- **Gestión Completa de Leads (CRUD)**:
  - Añade nuevos clientes registrando: *Nombre Completo, Empresa, Email, Teléfono, Presupuesto / Valor (€) y Notas*.
  - Edita o elimina leads haciendo clic directamente sobre sus tarjetas.
- **Doble Lógica de Usabilidad**:
  - **Escritorio**: Funcionalidad completa de *Drag and Drop* nativa para arrastrar y soltar las tarjetas entre columnas.
  - **Móvil**: Pestañas superiores para navegar rápidamente por cada columna y un menú de selección interno en cada tarjeta para mover los leads de forma cómoda en pantallas táctiles.
- **Dashboard de KPIs Inteligente**:
  - Calcula en tiempo real los *Leads Activos*, el *Valor Total del Pipeline* (suma de leads abiertos), la *Tasa de Conversión* (porcentaje de ganados vs cerrados) y los *Ingresos Ganados* totales.
- **Buscador en Tiempo Real**: Filtra instantáneamente por nombre de cliente, empresa, email o notas.
- **Portabilidad de Datos**:
  - Guarda los datos de forma local en el navegador (`LocalStorage`).
  - Permite **Exportar** e **Importar** toda la base de datos de leads en archivos `.json` para copias de seguridad.

---

## 🛠️ Tecnologías Utilizadas

- **HTML5**: Estructura limpia y semántica con iconos vectoriales SVG integrados.
- **CSS3**: Diseño responsivo (Mobile-First) utilizando Grid, Flexbox, variables de estilo y transiciones fluidas.
- **JavaScript (ES6)**: Lógica interactiva nativa modular, persistencia con LocalStorage e importador/exportador JSON.
- **Tipografía**: Importación de la fuente de Google Fonts **Outfit** con geometrías curvas que complementan la estética ovalada.

---

## 📂 Estructura de Archivos

```
CRMthalassa/
├── index.html   # Estructura de la SPA y modales
├── style.css    # Hojas de estilo y diseño ovalado responsivo
├── app.js       # Lógica del CRM, cálculo de KPIs y eventos
└── README.md    # Documentación del proyecto
```

---

## 💻 Cómo Iniciar el CRM

No requiere ningún paso de compilación o instalación previa. 

### Opción 1: Abrir directamente en el navegador
1. Descarga o clona los archivos en tu ordenador.
2. Haz doble clic en el archivo `index.html` para abrirlo en Chrome, Safari, Edge o Firefox.

### Opción 2: Servidor de desarrollo local (Recomendado para desarrollo)
Si tienes Node.js instalado, puedes levantar un servidor local en el directorio del proyecto con:
```bash
# Instalar y ejecutar un servidor local ligero
npx http-server .
```
O bien usando la extensión *Live Server* de Visual Studio Code.
