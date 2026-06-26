// ============================================================
// Vercel Serverless Function — GET /api/admin-usage
// Panel de administración: devuelve el uso de IA de TODOS los
// clientes. Solo accesible para los emails de ADMIN_EMAIL.
//
// El check de administrador se hace AQUÍ (servidor), comparando
// el email del token de Firebase contra la variable de entorno
// ADMIN_EMAIL (uno o varios separados por comas). Los datos de
// uso viven en users/{uid}/settings/usage; los leemos con una
// consulta de grupo de colección usando el SDK de administrador.
//
// Variables de entorno requeridas en Vercel (además de las de scan):
//   - ADMIN_EMAIL   email(s) admin separados por comas
// ============================================================

const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  } catch (e) {
    console.error('Error inicializando Firebase Admin:', e.message);
  }
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

module.exports = async (req, res) => {
  // ── 1. Autenticación ──────────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o caducada' });
  }

  // ── 2. Comprobar que es administrador ─────────────────────────────
  const email = (decoded.email || '').toLowerCase();
  if (!ADMIN_EMAILS.length || !ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Acceso restringido' });
  }

  // ── 3. Leer el uso de todos los clientes ──────────────────────────
  try {
    const db = admin.firestore();
    const month = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const snap = await db.collectionGroup('settings').get();

    const clients = [];
    snap.forEach((doc) => {
      if (doc.id !== 'usage') return; // solo los documentos de contador
      const parent = doc.ref.parent.parent; // users/{uid}
      const d = doc.data();
      clients.push({
        uid: parent ? parent.id : null,
        email: d.email || '—',
        monthCount: d.month === month ? d.count || 0 : 0,
        allTime: d.allTime || 0,
        lastScanAt: d.lastScanAt || null,
      });
    });

    clients.sort((a, b) => b.monthCount - a.monthCount);

    return res.status(200).json({ month, limit: 30, clients });
  } catch (e) {
    console.error('Error en admin-usage:', e.message);
    return res.status(500).json({ error: 'Error leyendo los datos de uso' });
  }
};
