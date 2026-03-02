
const yts = require('yt-search');

async function run() {
    try {
        const url = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKvYin_USF1qoJQnIyMAfRxl';
        // yt-search usually takes a query or opts. passing listId
        const listId = 'PLMC9KNkIncKvYin_USF1qoJQnIyMAfRxl';
        console.log('Testing ID:', listId);

        const playlist = await yts({ listId: listId });
        console.log('Success!');
        console.log('Title:', playlist.title);
        console.log('Tracks:', playlist.videos.length);
        console.log('First Track:', playlist.videos[0].title);
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
