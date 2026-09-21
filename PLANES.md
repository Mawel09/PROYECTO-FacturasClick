# Planes y precios — ThalassaFacturas (blueprint para Stripe)

Documento de referencia para implementar los pagos con Stripe.
Todos los precios son **+ IVA (21%)** (clientes B2B); Stripe Tax lo gestiona.

## Tipo de cuenta (elegido al registrarse)

- 🏢 **empresa** → dashboard "mis facturas" (el actual). Paga por sus propios escaneos.
- 🧾 **gestoria** → dashboard con selector de cliente; gestiona facturas de varios negocios.

Se guarda en `users/{uid}.accountType = 'empresa' | 'gestoria'` y la app enruta al
dashboard correspondiente.

## Prueba gratuita

- **14 días**, sin tarjeta al registrarse.
- Durante la prueba: nivel **Pro** (empresa) o **Starter** (gestoría) para que prueben a gusto.
- Al acabar la prueba sin suscripción → se limita el escaneo y se invita a elegir plan.

## Planes EMPRESA

| Plan | tier | Facturas/mes | Mensual | Anual (2 meses gratis) |
|------|------|:---:|:---:|:---:|
| Básico | `basico` | 50 | 9,90 € | 99 € |
| Pro | `pro` | 200 | 24,90 € | 249 € |

## Planes GESTORÍA (por tramos)

| Plan | tier | Clientes | Facturas/mes | Mensual | Anual |
|------|------|:---:|:---:|:---:|:---:|
| Starter | `starter` | 5 | 250 | 39 € | 390 € |
| Pro | `pro_gestoria` | 20 | 1.000 | 99 € | 990 € |
| Business | `business` | 50 | 3.000 | 199 € | 1.990 € |

## Reglas

- Límite mensual de escaneos se aplica en `api/scan.js` (sustituye el "30 fijo" por `plan.monthlyLimit`).
- El contador se resetea el día 1 de cada mes (ya implementado).
- Al llegar al límite → bloqueo + aviso para subir de plan.
- Gestoría: además, tope de nº de clientes (`plan.maxClients`).

## Productos/precios a crear en Stripe (modo prueba primero)

5 productos, cada uno con precio **mensual** y **anual** (EUR, recurrente, IVA exclusivo):

1. `ThalassaFacturas Empresa Básico` → 9,90 €/mes · 99 €/año
2. `ThalassaFacturas Empresa Pro` → 24,90 €/mes · 249 €/año
3. `ThalassaFacturas Gestoría Starter` → 39 €/mes · 390 €/año
4. `ThalassaFacturas Gestoría Pro` → 99 €/mes · 990 €/año
5. `ThalassaFacturas Gestoría Business` → 199 €/mes · 1.990 €/año

## Modelo de datos (Firestore) — `users/{uid}.plan`

```json
{
  "tier": "trial | basico | pro | starter | pro_gestoria | business | none",
  "status": "trialing | active | past_due | canceled",
  "interval": "month | year | null",
  "monthlyLimit": 200,
  "maxClients": 5,
  "trialEndsAt": "2026-10-05T00:00:00.000Z",
  "stripeCustomerId": "cus_...",
  "stripeSubscriptionId": "sub_...",
  "currentPeriodEnd": "2026-11-01T00:00:00.000Z"
}
```

## Piezas de código a construir (Fase 1 — Stripe)

- `api/create-checkout.js` — crea sesión de Stripe Checkout para el plan elegido.
- `api/stripe-webhook.js` — recibe eventos de Stripe y actualiza `users/{uid}.plan`.
- `api/customer-portal.js` — abre el portal de Stripe para gestionar/cancelar.
- `api/scan.js` — leer `plan.monthlyLimit` en vez de 30 fijo.
- UI: sección "Planes" + estado de suscripción.
- Variables de entorno Vercel: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` + los `price_...` IDs.
