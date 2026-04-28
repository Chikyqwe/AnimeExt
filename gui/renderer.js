const rssEl = document.getElementById('rss-value');
const heapEl = document.getElementById('heap-value');
const heapProgress = document.getElementById('heap-progress');
const uptimeEl = document.getElementById('uptime-value');
const lastMantenimientoEl = document.getElementById('mantenimiento-last');
const logContent = document.getElementById('log-content');
const logCountEl = document.getElementById('log-count');

const btnMantenimiento = document.getElementById('btn-mantenimiento');

const btnClear = document.getElementById('btn-clear');
const btnRestart = document.getElementById('btn-restart');



let logCount = 0;

function formatBytes(bytes) {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function formatUptime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs}h ${mins}m ${secs}s`;
}

async function updateStats() {
    try {
        const stats = await window.api.getStats();
        
        rssEl.textContent = formatBytes(stats.rss);
        heapEl.textContent = formatBytes(stats.heapUsed);
        
        const heapUsedPct = (stats.heapUsed / stats.heapTotal) * 100;
        heapProgress.style.width = `${Math.min(heapUsedPct, 100)}%`;
        
        uptimeEl.textContent = formatUptime(stats.uptime);
        
        if (stats.ultimoMantenimiento) {
            const date = new Date(stats.ultimoMantenimiento);
            lastMantenimientoEl.textContent = `Último: ${date.toLocaleTimeString()}`;
        } else {
            lastMantenimientoEl.textContent = 'Mantenimiento: Pendiente';
        }

    } catch (err) {
        console.error('Error updating stats:', err);
    }
}

function addLog(msg, level = 'info') {
    const line = document.createElement('div');
    line.className = `log-line ${level}`;
    const time = new Date().toLocaleTimeString();
    line.textContent = `[${time}] ${msg}`;
    logContent.appendChild(line);
    logContent.scrollTop = logContent.scrollHeight;
    
    logCount++;
    logCountEl.textContent = `${logCount} lineas`;
    
    // Auto-trim logs
    if (logCount > 100) {
        logContent.removeChild(logContent.firstChild);
        logCount--;
    }
}

// Interacciones
btnMantenimiento.onclick = async () => {
    addLog('Iniciando mantenimiento manual...', 'warn');
    btnMantenimiento.disabled = true;
    try {
        await window.api.runMaintenance();
        addLog('Mantenimiento completado con éxito.', 'info');
    } catch (err) {
        addLog('Error en mantenimiento: ' + err.message, 'error');
    } finally {
        btnMantenimiento.disabled = false;
    }
};



btnClear.onclick = () => {
    logContent.innerHTML = '';
    logCount = 0;
    logCountEl.textContent = '0 lineas';
    addLog('Logs limpiados.', 'info');
};

btnRestart.onclick = () => {
    if (confirm('¿Estás seguro de que quieres reiniciar la aplicación?')) {
        window.api.restartApp();
    }
};

// Polling de stats
setInterval(updateStats, 2000);
updateStats();

// Mensaje inicial
addLog('Dashboard conectado al servidor de AnimeExt', 'info');
addLog(`Servidor escuchando en puerto local`, 'info');

// Escuchar logs reales del servidor
window.api.onLog((data) => {
    if (!data) return;
    // Detectar nivel de log simple
    let level = 'info';
    if (data.toLowerCase().includes('error')) level = 'error';
    if (data.toLowerCase().includes('warn')) level = 'warn';
    
    addLog(data.trim(), level);
});

