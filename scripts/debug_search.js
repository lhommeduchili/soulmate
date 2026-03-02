const http = require('http');

const API_KEY = '1fd1368f0e33dff2687e0136e947976a';
const PORT = 64111;
const QUERY = 'Mufti Control';

function request(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/api/v0' + path,
            method: method,
            headers: {
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    console.error('Failed to parse JSON', data);
                    resolve(data);
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function run() {
    try {
        console.log('Searching for:', QUERY);
        const searchInit = await request('/searches', 'POST', { searchText: QUERY });
        console.log('Search ID:', searchInit.id);

        let found = false;
        let attempts = 0;

        // Wait for results to be available
        while (attempts < 5) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await request(`/searches/${searchInit.id}`);
            if (status.fileCount > 0) {
                console.log(`Search has ${status.fileCount} files. Starting brute force...`);
                break;
            }
            attempts++;
        }

        const endpoints = [
            `/searches/${searchInit.id}/files`,
            `/searches/${searchInit.id}/results`,
            `/searches/${searchInit.id}/matches`,
            `/searches/${searchInit.id}/responses?includeFiles=true`,
            `/searches/${searchInit.id}?includeFiles=true`,
            `/searches/${searchInit.id}?include_files=true`,
            `/searches/${searchInit.id}?files=true`,
            `/searches/${searchInit.id}?detailed=true`,
            `/searches/${searchInit.id}?verbose=true`
        ];

        for (const ep of endpoints) {
            console.log(`Trying ${ep}...`);
            try {
                const res = await request(ep);
                if (Array.isArray(res)) {
                    console.log(`[SUCCESS] Array returned with length ${res.length}`);
                    if (res.length > 0) console.log(JSON.stringify(res[0]).substring(0, 200));
                } else if (res.responses && res.responses.length > 0) {
                    console.log(`[SUCCESS] Responses found in object!`);
                    console.log(JSON.stringify(res.responses[0]).substring(0, 200));
                } else if (res.files && res.files.length > 0) {
                    console.log(`[SUCCESS] Files found in object!`);
                    console.log(JSON.stringify(res.files[0]).substring(0, 200));
                }
            } catch (e) { console.log('Failed'); }
        }

    } catch (e) {
        console.error(e);
    }
}

run();
