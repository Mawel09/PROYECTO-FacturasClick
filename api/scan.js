// ============================================================
// Vercel Serverless Function — POST /api/scan
// Proxy seguro para la IA (Gemini). La clave NUNCA viaja al
// navegador: vive en una variable de entorno del servidor.
//
// Flujo:
//   1. Verifica el token de sesión (Firebase Auth) del usuario.
//      Solo usuarios autenticados pueden consumir la IA.
//   2. Llama a Gemini con la clave secreta del servidor.
//   3. Devuelve el texto JSON crudo que el cliente parsea.
//
// Variables de entorno requeridas en Vercel:
//   - GEMINI_API_KEY         clave de Google AI Studio (servidor)
//   - FIREBASE_PROJECT_ID    id del proyecto Firebase
//   - FIREBASE_CLIENT_EMAIL  email de la cuenta de servicio
//   - FIREBASE_PRIVATE_KEY   clave privada de la cuenta de servicio
//                            (pega el valor completo con \n incluidos)
// ============================================================

const admin = require('firebase-admin');

// Inicializar Firebase Admin una sola vez (se reutiliza en invocaciones "calientes")
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel guarda los saltos de línea como "\n" literales; los restauramos.
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  } catch (e) {
    console.error('Error inicializando Firebase Admin:', e.message);
  }
}

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Límite de escaneos por usuario y mes. Se aplica AQUÍ (servidor) para que no se
// pueda saltar desde el navegador y así proteger el coste de la API de Gemini.
const MONTHLY_LIMIT = 30;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // ── 1. Autenticación: verificar el token de Firebase ──────────────
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o caducada' });
  }

  // ── 2. Clave de IA del servidor ───────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Servicio de IA no configurado en el servidor' });
  }

  // ── 3. Validar entrada ────────────────────────────────────────────
  const { imageBase64, mimeType, prompt } = req.body || {};
  if (!imageBase64 || !prompt) {
    return res.status(400).json({ error: 'Falta la imagen o el prompt' });
  }

  // ── 3b. Límite mensual por usuario (autoritativo en el servidor) ──
  // Reservamos un escaneo ANTES de llamar a Gemini, de forma atómica, para que
  // dos peticiones simultáneas no puedan superar el límite. Si Gemini falla
  // después, devolvemos el escaneo al contador (refundUsage).
  const db = admin.firestore();
  const usageRef = db.collection('users').doc(uid).collection('settings').doc('usage');
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  const refundUsage = async () => {
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef);
        if (snap.exists && snap.data().month === currentMonth) {
          const count = snap.data().count || 0;
          tx.set(usageRef, { month: currentMonth, count: Math.max(0, count - 1) });
        }
      });
    } catch (_) {
      /* mejor esfuerzo: si el reembolso falla, no rompemos la respuesta */
    }
  };

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      let count = 0;
      if (snap.exists && snap.data().month === currentMonth) {
        count = snap.data().count || 0;
      }
      if (count >= MONTHLY_LIMIT) {
        return { allowed: false, count };
      }
      tx.set(usageRef, { month: currentMonth, count: count + 1 });
      return { allowed: true, count: count + 1 };
    });

    if (!result.allowed) {
      return res.status(429).json({
        error: `Has alcanzado el límite de ${MONTHLY_LIMIT} facturas este mes.`,
        limit: MONTHLY_LIMIT,
        count: result.count,
      });
    }
  } catch (e) {
    // Si Firestore falla al comprobar el límite, preferimos NO bloquear el
    // servicio (mejor permitir el escaneo que dejar al cliente sin poder usarlo).
    console.error('Error comprobando el límite de uso:', e.message);
  }

  // ── 4. Llamar a Gemini ────────────────────────────────────────────
  try {
    const geminiResp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          // Desactiva el "modo pensamiento" de Gemini 2.5 Flash: para extraer datos
          // estructurados de una factura no aporta, y abarata/acelera cada escaneo.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!geminiResp.ok) {
      await refundUsage(); // el escaneo no se completó: lo devolvemos al contador
      const errData = await geminiResp.json().catch(() => ({}));
      return res
        .status(502)
        .json({ error: errData?.error?.message || `Error Gemini ${geminiResp.status}` });
    }

    const data = await geminiResp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ text });
  } catch (e) {
    await refundUsage(); // fallo de red al llamar a Gemini: devolvemos el escaneo
    console.error('Error llamando a Gemini:', e.message);
    return res.status(502).json({ error: 'Error llamando a la IA: ' + e.message });
  }
};
