# Reglas de Firebase Storage (para las fotos de las facturas)

Las **imágenes** de las facturas se guardan en **Firebase Storage**, en la ruta
`users/{uid}/receipts/{idFactura}`. Esto es DISTINTO de Firestore (que guarda los
datos). Necesita sus propias reglas.

Si estas reglas no están publicadas (o están en "modo bloqueado"/prueba caducada),
al escanear o importar con foto la subida falla y la imagen no se adjunta — aunque
los datos de la factura sí se guarden.

## Cómo aplicarlas

1. [Firebase Console](https://console.firebase.google.com/) → proyecto **tablerofacturasline**.
2. Menú lateral **Storage** → pestaña **Reglas** (Rules).
   - Si es la primera vez, puede pedirte **"Comenzar"/"Get started"** para activar Storage. Actívalo (elige la región europea, p. ej. `europe-west`).
3. **Borra** lo que haya y **pega** esto:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Cada usuario solo puede leer/escribir sus propias imágenes de facturas
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

4. Pulsa **Publicar** (Publish).

## Comprobación

Tras publicar, vuelve a importar el archivo `..._con_fotos.json`:
- Las facturas deben aparecer **con su foto** en el detalle.
- Si escaneas una factura nueva desde la app, la foto también debe guardarse.

> Nota: estas reglas afectan a TODAS las imágenes (escaneo normal + importación).
> Sin ellas, ninguna foto se guarda, no solo las importadas.
