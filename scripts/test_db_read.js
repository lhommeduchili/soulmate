const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'Library/Application Support/soulmate/data/search.db');
console.log("Opening DB:", dbPath);

try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    // Get latest search with results
    const stmt = db.prepare(`
        SELECT Id, SearchText, ResponsesJson 
        FROM Searches 
        WHERE FileCount > 0 
        ORDER BY StartedAt DESC 
        LIMIT 1
    `);

    const row = stmt.get();

    if (row) {
        console.log("Found Search ID:", row.Id);
        console.log("Search Text:", row.SearchText);

        if (row.ResponsesJson) {
            const responses = JSON.parse(row.ResponsesJson);
            console.log("Parsed Responses Array Length:", responses.length);
            if (responses.length > 0) {
                console.log("First Response FileCount:", responses[0].FileCount);
                if (responses[0].Files && responses[0].Files.length > 0) {
                    console.log("First File:", responses[0].Files[0].Filename);
                }
            }
        } else {
            console.log("ResponsesJson is null");
        }
    } else {
        console.log("No searches with files found.");
    }

    db.close();

} catch (e) {
    console.error("DB Error:", e);
}
