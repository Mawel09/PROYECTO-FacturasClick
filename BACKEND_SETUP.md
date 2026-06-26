# Configuración del Backend de IA (Proxy Seguro)

La app llama a la IA a través de una **Vercel Serverless Function** (`api/scan.js`)
que oculta la clave de Gemini en el servidor. El navegador del cliente **nunca**
ve la clave. Para que funcione hay que configurar 4 variables de entorno en Vercel.

> Mientras no configures esto, la app sigue funcionando si el usuario tiene una
> clave local guardada (respaldo de desarrollo). Para el producto final (clientes
> sin su propia clave), estos pasos son **obligatorios**.

---

## 1. Clave de Gemini (servidor)

1. Entra en [Google AI Studio → API Keys](https://aistudio.google.com/app/apikey).
2. Crea una clave (empieza por `AIza...`).
3. Guárdala para el paso 4 → será `GEMINI_API_KEY`.

## 2. Credenciales de Firebase Admin (cuenta de servicio)

Sirven para verificar que quien llama está realmente logueado.

1. [Firebase Console](https://console.firebase.google.com/) → proyecto **tablerofacturasline**.
2. ⚙️ *Configuración del proyecto* → pestaña **Cuentas de servicio**.
3. Botón **Generar nueva clave privada** → descarga un archivo `.json`.
4. Abre ese JSON. Necesitarás 3 valores:
   - `project_id`   → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key`  → `FIREBASE_PRIVATE_KEY` (el texto largo entre comillas,
     incluyendo `-----BEGIN PRIVATE KEY-----` ... `-----END PRIVATE KEY-----`)

> ⚠️ Ese `.json` es secreto. **No lo subas a GitHub.** Solo copias sus valores a Vercel.

## 3. (Opcional pero recomendado) CORS de Firebase Storage

Necesario para que el **PDF fiscal** pueda incrustar las fotos originales.
Con [gsutil](https://cloud.google.com/storage/docs/gsutil_install) o Cloud Shell:

```bash
echo '[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json
gsutil cors set cors.json gs://tablerofacturasline.firebasestorage.app
```

## 4. Variables de entorno en Vercel

Proyecto en Vercel → **Settings** → **Environment Variables**. Añade (para
*Production* y *Preview*):

| Nombre                 | Valor                                              |
|------------------------|----------------------------------------------------|
| `GEMINI_API_KEY`       | tu clave de Gemini (paso 1)                        |
| `FIREBASE_PROJECT_ID`  | `tablerofacturasline`                              |
| `FIREBASE_CLIENT_EMAIL`| el `client_email` del JSON                         |
| `FIREBASE_PRIVATE_KEY` | el `private_key` del JSON (pégalo tal cual)        |

Luego haz un **Redeploy** (Deployments → ⋯ → Redeploy) para que tome las variables.

---

## Cómo comprobar que funciona

1. Inicia sesión en la app desplegada.
2. Escanea una factura. Si funciona sin tener ninguna clave en *Ajustes*,
   significa que el proxy está activo. ✅
3. Si ves "Servicio de IA no disponible", revisa las variables de entorno y el
   log de la función en Vercel (Deployments → Functions → `api/scan`).
