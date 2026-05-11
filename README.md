# soulmate

a desktop application that allows users to download audio from soulseek via a spotify interface. it integrates with the soulseek daemon (`slskd`) in the background.

## core features

- spotify login integration: authenticate with spotify to fetch private playlists.
- spotify/youtube public playlists integration: fetch public playlists from spotify & youtube.
- automated downloads: searches and downloads matching tracks from the soulseek network.
- bundled daemon: manages its own instance of `slskd` without requiring external configuration.

## getting started

dependencies:
- node.js (v18+)

```bash
# clone repository
git clone https://github.com/lhommeduchili/soulmate.git
cd soulmate

# install dependencies
npm install

# configure local environment
cp .env.example .env
# then edit .env and set VITE_SPOTIFY_CLIENT_ID

# fetch os-specific slskd binaries
npm run binaries:download

# start development server
npm run dev

# build release (mac)
npm run build:mac
```

for github actions releases, define `VITE_SPOTIFY_CLIENT_ID` in repository secrets so the packaged app includes spotify oauth configuration.

## documentation

see the [`docs/`](./docs) directory for:
- `specifications.md`: software requirements and design constraints.
- `plan.md`: implementation roadmap.
- `todo.md`: current task list.

## contributing

please read [`contributing.md`](contributing.md) for details on our code of conduct and development process.

## license

this project is licensed under the gnu general public license v3.0 - see the `license` file for details.
