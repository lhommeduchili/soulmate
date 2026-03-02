
const ytpl = require('ytpl');

async function run() {
    try {
        const url = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKvYin_USF1qoJQnIyMAfRxl';
        // Mocking the input I use in App.tsx
        console.log('Testing URL:', url);
        if (ytpl.validateID(url)) {
            console.log('ID Validated');
            const playlist = await ytpl(url, { limit: 10 });
            console.log('Success!');
            console.log('Title:', playlist.title);
            console.log('Tracks:', playlist.items.length);
        } else {
            console.log('Invalid ID according to ytpl');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
