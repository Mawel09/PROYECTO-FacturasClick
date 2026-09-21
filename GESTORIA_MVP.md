# Gestoría — MVP (blueprint de construcción)

Decisiones cerradas:
- **Modelo A**: la gestoría mete/importa/escanea las facturas y **asigna cada una a un cliente**.
  (Los clientes NO suben nada por su cuenta en el MVP → eso es Fase 2.)
- **Cliente = ficha** dentro de la cuenta de la gestoría (nombre, NIF, notas). **Sin login propio.**

## Tipo de cuenta (base de todo)

Al registrarse, el usuario elige **empresa** o **gestoria**:
- Se guarda en `users/{uid}.accountType`.
- La app enruta al dashboard correspondiente al iniciar sesión.
- **empresa**: dashboard actual (sus propias facturas). Sin clientes.
- **gestoria**: dashboard de cartera con selector de cliente.

## Modelo de datos (Firestore)

- `users/{uid}.accountType = 'empresa' | 'gestoria'`
- `users/{uid}/clients/{clientId} = { nombre, nif, notas, createdAt }`  (solo gestoría)
- Cada factura (`users/{uid}/receipts/{id}`) gana un campo **`clientId`**.
  - Empresa → `clientId` ausente/null (comportamiento actual intacto).
  - Gestoría → cada factura pertenece a un `clientId`.

## Pantallas del dashboard gestoría

1. **Selector de cliente** (arriba): "Todos" o un cliente concreto. Filtra todo por `clientId`.
2. **Vista global** ("Todos"):
   - KPIs de cartera: nº clientes, facturas del mes (todos), gasto gestionado, clientes sin facturas este mes.
   - Tabla de clientes: nombre · NIF · nº facturas mes · gasto · estado (Al día / Pendiente / Sin facturas) · acciones (Ver / Exportar).
3. **Vista de cliente** (al elegir uno): el dashboard actual de empresa, **filtrado a ese cliente**.
4. **Gestión de clientes**: alta / edición / borrado de fichas de cliente.
5. **Subir/escanear con cliente**: al meter una factura, se elige a qué cliente va (selector obligatorio en modo gestoría).
6. **Export por cliente**: el ZIP fiscal existente (CSV + JSON + fotos), filtrado a un cliente.

## Compatibilidad

- Las cuentas **empresa** no se ven afectadas: sin `accountType='gestoria'` no aparece selector ni clientes; las facturas siguen igual.
- El límite mensual de escaneos (contador actual) sigue aplicando por CUENTA (la gestoría gasta de su plan mayor).

## Orden de construcción sugerido

1. **Base tipo de cuenta**: elección empresa/gestoría en el registro + guardar `accountType` + enrutar dashboard.
2. **Clientes**: colección `clients` + pantalla de gestión (alta/edición).
3. **Asignación**: campo `clientId` en facturas + selector al subir/escanear/importar.
4. **Vista global + selector**: KPIs de cartera + tabla de clientes + filtrado.
5. **Export por cliente** (reutiliza el ZIP actual filtrado).

Fase 2 (futuro): Modelo B — los clientes suben sus propias facturas (sub-cuentas o enlaces de subida por cliente).
