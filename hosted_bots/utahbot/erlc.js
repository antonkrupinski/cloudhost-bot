// erlc.js

// Helper for interacting with the ERLC API
let fetch;
try {
    fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
} catch (e) {
    throw new Error('node-fetch could not be loaded');
}

const ERLC_API_KEY = '';
const ERLC_API_URL = 'https://api.policeroleplay.community/v1/server/command';


async function runErlcCommand(command) {
    const response = await fetch(ERLC_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'server-key': ERLC_API_KEY
        },
        body: JSON.stringify({ command })
    });
    if (!response.ok) {
        throw new Error(`ERLC API error: ${response.statusText}`);
    }
    return response.json();
}

async function getErlcPlayers() {
    const url = 'https://api.policeroleplay.community/v1/server/players';
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'server-key': ERLC_API_KEY
        }
    });
    if (!response.ok) {
        throw new Error(`ERLC API error: ${response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data.length : 0;
}

module.exports = { runErlcCommand, getErlcPlayers };