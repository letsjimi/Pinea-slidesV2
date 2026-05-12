
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname)));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/tv-left', (req, res) => res.sendFile(path.join(__dirname, 'tv-left.html')));
app.get('/tv-right', (req, res) => res.sendFile(path.join(__dirname, 'tv-right.html')));

const server = app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    let localIP = 'localhost';
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIP = iface.address;
                break;
            }
        }
    }
    console.log(`\n🎬 PINEA Slides V3 — Server läuft!`);
    console.log(`═════════════════════════════════════`);
    console.log(`  Admin Panel:  http://${localIP}:${PORT}/admin`);
    console.log(`  TV Links:     http://${localIP}:${PORT}/tv-left`);
    console.log(`  TV Rechts:    http://${localIP}:${PORT}/tv-right`);
    console.log(`═════════════════════════════════════\n`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
