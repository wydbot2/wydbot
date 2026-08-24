# Game resources

WYDBot downloads all game resources automatically on first launch — no manual
setup required.

## How it works

- Assets come from the **official CDN** (the same CloudFront origin the official
  launcher hits — this project hosts nothing and redistributes no game files).
- They are stored locally under `game-assets/v<N>` inside the app's userData
  directory (e.g. `%APPDATA%/wyd-bot` on Windows, `~/Library/Application
Support/wyd-bot` on macOS).
- Later launches re-validate the local store and only fetch what changed.
- This applies to **dev and packaged builds alike** — the boot gate always runs.

## First launch

```bash
npm install
npm run build
npm start
```

The splash screen shows download progress ("X / Y MB · N arquivos"). When it
finishes, the login screen appears.

## Troubleshooting

- **"Falha ao baixar recursos do jogo"** — the app could not reach the CDN.
  Check your internet connection and press retry on the splash screen.
- **Corrupt local store** — delete the `game-assets` folder inside userData and
  restart; the gate downloads everything again.
- **QA/Staging assets** — set the `ASSET_INFO_URL` shell variable to point the
  gate at a different `info.json` manifest:

  ```bash
  ASSET_INFO_URL=https://example.com/info.json npm run dev
  ```
