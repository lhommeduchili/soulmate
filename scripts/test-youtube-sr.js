
const YouTube = require('youtube-sr').default;

async function run() {
    try {
        const url = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKvYin_USF1qoJQnIyMAfRxl';
        console.log('Testing URL:', url);

        const playlist = await YouTube.getPlaylist(url, { limit: 10 });
        console.log('Success!');
        console.log('Title:', playlist.title);
        console.log('Tracks:', playlist.videos.length);
        console.log('First Track:', playlist.videos[0].title);
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
