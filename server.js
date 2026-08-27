*
 * REMORQO — Backend VoIP avec stockage PostgreSQL
 * -------------------------------------------------
 * Reprend exactement la même logique que remorqo-voip-backend.js,
 * mais remplace le Map() en mémoire par une vraie base PostgreSQL
 * (voir remorqo-db.sql pour le schéma à exécuter avant de lancer ceci).
 *
 * npm install express twilio pg
 *
 * Variables d'environnement supplémentaires :
 * DATABASE_URL=postgres://user:password@host:5432/remorqo
 */
const express = require('express');
const twilio = require('twilio');
const { Pool } = require('pg');
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const VoiceResponse = twilio.twiml.VoiceResponse;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// --- Fonctions d'accès aux missions ---
async function createMission(missionId, clientId, depanneurId, durationMinutes) {
 const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
 await pool.query(
 `INSERT INTO missions (id, client_id, depanneur_id, status, expires_at)
 VALUES ($1, $2, $3, 'active', $4)
 ON CONFLICT (id) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
 [missionId, clientId, depanneurId, expiresAt]
 );
 return expiresAt;
}
async function getMission(missionId) {
 const { rows } = await pool.query('SELECT * FROM missions WHERE id = $1', [missionId]);
 return rows[0] || null;
}
async function closeMission(missionId) {
 await pool.query(`UPDATE missions SET status = 'closed' WHERE id = $1`, [missionId]);
}
function isMissionUsable(mission) {
 return mission && mission.status === 'active' && new Date(mission.expires_at) > new Date();
}
// --- Routes (identiques à la version en mémoire, juste branchées sur Postgres) ---
app.post('/missions', async (req, res) => {
 const { missionId, clientId, depanneurId, durationMinutes = 90 } = req.body;
 if (!missionId || !clientId || !depanneurId) {
 return res.status(400).json({ error: 'missionId, clientId, depanneurId requis' });
 }
 const expiresAt = await createMission(missionId, clientId, depanneurId, durationMinutes);
 res.json({ missionId, expiresAt });
});
app.get('/call-token', async (req, res) => {
 const { missionId, userId } = req.query;
 const mission = await getMission(missionId);
 if (!mission) return res.status(404).json({ error: 'Mission introuvable ou expirée' });
 if (!isMissionUsable(mission)) return res.status(410).json({ error: 'Mission terminée, appe if (![mission.client_id, mission.depanneur_id].includes(userId)) {
 return res.status(403).json({ error: 'Utilisateur non autorisé pour cette mission' });
 }
 const role = userId === mission.client_id ? 'client' : 'depanneur';
 const identity = `${missionId}_${role}`;
 const token = new AccessToken(
 process.env.TWILIO_ACCOUNT_SID,
 process.env.TWILIO_API_KEY_SID,
 process.env.TWILIO_API_KEY_SECRET,
 {
 identity,
 ttl: Math.max(60, Math.floor((new Date(mission.expires_at) - Date.now()) / 1000)),
 }
 );
 token.addGrant(
 new VoiceGrant({
 outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
 incomingAllow: true,
 })
 );
 res.json({ token: token.toJwt(), identity, expiresAt: mission.expires_at });
});
app.post('/voice', async (req, res) => {
 const callerIdentity = req.body.From;
 const twiml = new VoiceResponse();
 const match = callerIdentity.match(/^(.+)_(client|depanneur)$/);
 if (!match) {
 twiml.say({ language: 'fr-FR' }, 'Appel non autorisé.');
 return res.type('text/xml').send(twiml.toString());
 }
 const [, missionId, role] = match;
 const mission = await getMission(missionId);
 if (!isMissionUsable(mission)) {
 twiml.say({ language: 'fr-FR' }, "Cette mission est terminée, l'appel n'est plus disponib return res.type('text/xml').send(twiml.toString());
 }
 const targetRole = role === 'client' ? 'depanneur' : 'client';
 const dial = twiml.dial({ answerOnBridge: true, timeout: 25 });
 dial.client(`${missionId}_${targetRole}`);
 res.type('text/xml').send(twiml.toString());
});
app.post('/missions/:missionId/close', async (req, res) => {
 const mission = await getMission(req.params.missionId);
 if (!mission) return res.status(404).json({ error: 'Mission introuvable' });
 await closeMission(req.params.missionId);
 res.json({ status: 'closed' });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Remorqo VoIP backend (Postgres) actif sur le port ${PORT}sans la fermeture). Quand tu colles le code, ajoute bien});