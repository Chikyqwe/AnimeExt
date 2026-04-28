// src/routes/index.js
const express = require('express');
const router = express.Router();
const fs = require("fs");
const path = require("path");
const animeController = require('../controllers/animeController');
const imageController = require('../controllers/imageController');

router.get('/anime/list', animeController.list);
router.get('/anime/list/ext/beta/cordova/beta/anime/app/chikyqwe', animeController.list);

router.get('/image', imageController.imageProxy);
router.get('/anime/last', animeController.last);
router.get('/api/logs', (req, res) => {
    try {
        const { level, limit = 100 } = req.query;

        const logFile = path.join(process.cwd(), "animeext.log");
        if (!fs.existsSync(logFile)) return res.json([]);

        const lines = fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean);

        let logs = [];

        for (let i = lines.length - 1; i >= 0 && logs.length < limit; i--) {
            try {
                const parsed = JSON.parse(lines[i]);

                if (!level || parsed.level === level) {
                    logs.push(parsed);
                }
            } catch { }
        }

        res.json(logs.reverse());

    } catch {
        res.status(500).json({ error: "Error leyendo logs" });
    }
});
router.get('/undefined', (req, res) => {
    res.json({ msg: "?" });
});
module.exports = router;
