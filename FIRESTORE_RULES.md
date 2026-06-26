# Reglas de seguridad de Firestore (IMPORTANTE)

Estas reglas hacen dos cosas:

1. **Cada usuario solo accede a SUS datos** (facturas, ajustes). Esto es lo que
   garantiza que tus facturas se guarden con tu usuario y reaparezcan al iniciar
   sesión en cualquier dispositivo.
2. **Protegen el contador de uso** (`settings/usage`) para que el cliente NO pueda
   reescribirlo y saltarse el límite de 30 facturas/mes. Solo el backend (que usa
   el SDK de administrador y se salta las reglas) puede modificar el contador.

## ⚠️ Por qué tus facturas desaparecían al refrescar

La causa más común es que el proyecto tenía las reglas en **"modo de prueba"
(test mode)**, que **caducan a los 30 días** y luego **bloquean todo**. Cuando
caducaron, las escrituras dejaron de llegar al servidor (solo quedaban en la caché
local del navegador) y al refrescar/entrar en otro dispositivo desaparecían.
Poniendo estas reglas permanentes, el problema se soluciona de raíz.

## Cómo aplicarlas

1. [Firebase Console](https://console.firebase.google.com/) → proyecto **tablerofacturasline**.
2. Menú lateral **Firestore Database** → pestaña **Reglas** (Rules).
3. **Borra** todo lo que haya y **pega** esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Documento del propio usuario
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      // Facturas: el dueño puede leer y escribir las suyas
      match /receipts/{receiptId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      // Ajustes: el dueño puede leer todos los suyos y escribir todos
      // EXCEPTO el contador de uso ('usage'), que solo lo escribe el backend.
      match /settings/{docId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if request.auth != null
                     && request.auth.uid == userId
                     && docId != 'usage';
      }
    }
  }
}
```

4. Pulsa **Publicar** (Publish).

## Comprobación

Tras publicar:
- Inicia sesión, escanea/guarda una factura, **refresca la página** → la factura
  debe seguir ahí.
- Cierra sesión y vuelve a entrar → tus facturas y datos siguen apareciendo.
- Si intentas escanear más de 30 en un mes, el backend lo bloquea (error 429) y
  el cliente no puede resetear su propio contador.
