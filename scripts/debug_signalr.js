const signalR = require("@microsoft/signalr");
const http = require('http');
// Polyfill WebSocket for Node.js
global.WebSocket = require('ws');

// Basic setup
const PORT = 64111;
const USERNAME = "admin";
const PASSWORD = "admin";
const API_KEY = "1fd1368f0e33dff2687e0136e947976a";

function getJson(path, token) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/api/v0' + path,
            method: 'GET',
            headers: {
                'X-API-Key': API_KEY,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };
        const req = http.get(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
                } else {
                    console.log(`[GET ${path}] Error ${res.statusCode}:`, data);
                    resolve(null);
                }
            });
        });
        req.on('error', reject);
    });
}

function postJson(path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/api/v0' + path,
            method: 'POST',
            headers: {
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json'
            }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
            });
        });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    try {
        console.log("1. Authenticating...");
        const session = await postJson('/session', { username: USERNAME, password: PASSWORD });
        let token = session.token || (session.data && session.data.token);
        console.log("Token:", token ? token.substring(0, 20) + "..." : "NONE");

        console.log("2. Starting Search...");
        const searchInit = await postJson('/searches', { searchText: 'Thievery Corporation' });
        console.log("Search ID:", searchInit.id);

        console.log("3. Waiting 5 seconds for results...");
        await new Promise(r => setTimeout(r, 5000));

        console.log("4. Fetching Full Search Object...");
        const fullSearch = await getJson(`/searches/${searchInit.id}`, token);
        if (fullSearch) {
            console.log("Keys:", Object.keys(fullSearch));
            console.log("Response Count (Property):", fullSearch.responseCount);
            console.log("Responses Array Length:", fullSearch.responses ? fullSearch.responses.length : "null");
            console.log("Full Object Snapshot:", JSON.stringify(fullSearch, null, 2).substring(0, 1000));
        }

        console.log("5. Fetching /responses endpoint...");
        const responses = await getJson(`/searches/${searchInit.id}/responses`, token);
        if (Array.isArray(responses)) {
            console.log("Responses Endpoint Length:", responses.length);
            if (responses.length === 0) console.log("Responses Endpoint returned EMPTY array.");
        } else {
            console.log("Responses Endpoint returned:", responses);
        }

    } catch (e) {
        console.error(e);
    }
}

run();
