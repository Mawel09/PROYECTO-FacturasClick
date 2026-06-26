# ThalassaCRM — Gestor Inteligente de Facturas con IA

**ThalassaCRM** (también llamado *FacturasClick* / *Thalassa Receipts*) es una aplicación web que digitaliza y gestiona facturas y tickets de compra de forma automática. Subes una foto del ticket, la **IA (Gemini Vision)** lee el comercio, la fecha, los productos y el total, y los guarda organizados en la nube para consultarlos, analizarlos y exportarlos con validez fiscal.

El diseño está optimizado para una experiencia estética y premium: fondo blanco limpio con acentos azul marino, bordes muy redondeados, sombras suaves y micro-interacciones fluidas.

---

## 🚀 Características Principales

- **Escaneo con IA (Gemini Vision)**: Sube una foto de un ticket/factura y la IA extrae automáticamente:
  - Nombre del comercio, fecha, lista de productos (nombre, cantidad, precio unitario y total) e importe total.
- **Soporte de doble proveedor de IA**: Funciona con **Google Gemini** (recomendado, lecturas más fiables) o con **OpenAI (GPT-4o-mini)**. El proveedor se detecta automáticamente según el formato de la API Key.
- **Pantalla de revisión**: Antes de guardar, puedes corregir cualquier dato extraído por la IA (productos, precios, fecha, notas).
- **Almacenamiento en la nube (Firebase)**: Los datos y las imágenes originales se guardan por usuario en **Firestore** y **Firebase Storage**, con **persistencia offline** para seguir funcionando sin conexión.
- **Dashboard de KPIs**: Gasto mensual, número de tickets, ticket medio y comercio principal, calculados en tiempo real.
- **Informes y análisis**: Gasto por comercio, productos más comprados, frecuencia de compra y previsión de compras.
- **Lista de la compra y categorización de productos**: Clasifica productos por categoría (peluquería, estética, general).
- **Calendario fiscal**: Avisos de obligaciones fiscales.
- **Exportación de PDF fiscalmente válido**: Genera un PDF con las fotos originales de los tickets embebidas, apto para presentación legal.
- **Portabilidad de datos**: Exporta e importa toda la base de datos en archivos `.json` para copias de seguridad.
- **Acceso protegido con PIN**: La aplicación se desbloquea mediante un PIN.

---

## 🛠️ Tecnologías Utilizadas

- **HTML5 / CSS3 / JavaScript (ES6)**: SPA nativa sin framework ni paso de compilación. Diseño responsivo (Mobile-First) con Grid, Flexbox y transiciones fluidas.
- **IA de Visión**: Google **Gemini 2.0 Flash** (API REST) y, opcionalmente, OpenAI **GPT-4o-mini**.
- **Backend**: **Firebase** — Firestore (datos), Storage (imágenes) y Auth.
- **Despliegue**: **Vercel**.
- **Tipografía**: Google Fonts **Outfit**.

---

## 📂 Estructura de Archivos

```
CRMthalassa/
├── index.html   # Estructura de la SPA, modales y carga de los SDK de Firebase
├── style.css    # Hojas de estilo y diseño responsivo
├── app.js       # Toda la lógica: escaneo IA, persistencia Firestore, KPIs, informes, export PDF
└── README.md    # Documentación del proyecto
```

---

## ⚙️ Configuración

1. **API Key de IA**: Entra en *Ajustes* dentro de la app e introduce tu API Key.
   - **Gemini** (recomendado): obtén una clave gratuita en [Google AI Studio](https://aistudio.google.com/app/apikey). Las claves empiezan por `AIza...`.
   - **OpenAI** (alternativa): claves que empiezan por `sk-...`.
   - El proveedor se selecciona automáticamente según el prefijo de la clave.
2. **Firebase**: La configuración del proyecto está en `app.js` (`firebaseConfig`). Si despliegas tu propia instancia, sustitúyela por la de tu proyecto de Firebase.

---

## 💻 Cómo Iniciar la Aplicación

No requiere ningún paso de compilación.

### Opción 1: Servidor de desarrollo local (Recomendado)
```bash
# Levanta un servidor local ligero en el directorio del proyecto
npx http-server .
```
O usa la extensión *Live Server* de Visual Studio Code.

> **Nota:** Se recomienda servir la app vía `http://` (no abriendo el archivo con `file://`) para que el SDK de Firebase y las llamadas a las APIs de IA funcionen correctamente.

### Opción 2: Abrir directamente en el navegador
Haz doble clic en `index.html`. Ten en cuenta que algunas funciones (Firebase) pueden requerir un servidor local.
