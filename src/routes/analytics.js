"use strict";

const express = require('express');
const crypto = require('crypto');
const { supabase } = require('../services/supabase/supabase');

const router = express.Router();


// =========================
// 🔐 GENERADOR DE FINGERPRINT
// =========================
function generateFingerprint({ ip, userAgent, platform }) {
    const raw = `${ip}|${userAgent}|${platform}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
}


// =========================
// 📱 OBTENER / CREAR DID
// =========================
router.get('/get/did', async (req, res) => {
    try {
        const ip = req.ip || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const platform = req.headers['sec-ch-ua-platform'] || 'unknown';

        const fingerprint = generateFingerprint({ ip, userAgent, platform });

        // 🔎 Buscar dispositivo existente
        const { data, error } = await supabase
            .from('devices')
            .select('did')
            .eq('fingerprint', fingerprint)
            .limit(1);

        if (error) {
            console.error('[ANALYTICS] Error buscando DID:', error.message);
            return res.status(500).json({ error: 'Database error' });
        }

        // ✅ Si existe → regresar DID
        if (data && data.length > 0) {
            return res.status(200).json({ did: data[0].did });
        }

        // 🆕 Crear nuevo DID
        const did = crypto.randomUUID();

        const { error: insertError } = await supabase
            .from('devices')
            .insert({
                did,
                fingerprint,
                user_agent: userAgent,
                platform,
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('[ANALYTICS] Error guardando DID:', insertError.message);
            return res.status(500).json({ error: 'Database error' });
        }

        return res.status(200).json({ did });

    } catch (error) {
        console.error('[ANALYTICS] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// =========================
// 📊 ANALYTICS ENDPOINT
// =========================
router.post('/api/v1/analytics', async (req, res) => {
    try {
        const {
            event,
            path,
            platform,
            did,
            meta // opcional (objeto JSON)
        } = req.body;

        if (!event) {
            return res.status(400).json({ error: 'Missing event' });
        }

        const logEntry = {
            event,
            path: path || 'unknown',
            platform: platform || 'unknown',
            did: did || 'anonymous',
            ip: req.ip || 'unknown',
            meta: meta || {},
            created_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('analytics')
            .insert([logEntry]);

        if (error) {
            console.error('[ANALYTICS] Error guardando analytics:', error.message);
            return res.status(500).json({ error: 'Database error' });
        }

        res.status(200).json({ ok: true });

    } catch (error) {
        console.error('[ANALYTICS] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;