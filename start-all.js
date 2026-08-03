const { spawn } = require('child_process');
const path = require('path');

const SERVERS = [
    { name: 'gar', dir: 'Assets/Multi/Gar', color: '\x1b[33m' },
];
const RESET = '\x1b[0m';
const procs = [];
let shuttingDown = false;

function launch(s) {
    const cwd = path.join(__dirname, s.dir);
    const tag = s.color + '[' + s.name + ']' + RESET + ' ';
    const child = spawn(process.execPath, ['server.js'], { cwd });

    const pipe = (stream, out) => {
        let buf = '';
        stream.on('data', d => {
            buf += d.toString();
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
                out.write(tag + buf.slice(0, i) + '\n');
                buf = buf.slice(i + 1);
            }
        });
    };
    pipe(child.stdout, process.stdout);
    pipe(child.stderr, process.stderr);

    child.on('exit', code => {
        process.stdout.write(tag + 'stopped (exit code ' + code + ')\n');
        shutdown();
    });
    child.on('error', err => {
        process.stdout.write(tag + 'failed to start: ' + err.message + '\n');
    });
    procs.push(child);
}

function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    procs.forEach(p => { try { p.kill(); } catch (e) {} });
    setTimeout(() => process.exit(0), 200);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

SERVERS.forEach(launch);
process.stdout.write('Starting Chosevn servers. Press Ctrl+C to stop them all.\n');
