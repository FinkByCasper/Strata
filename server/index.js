import { openStore } from './db.js';
import { createApp } from './app.js';
import { banner } from './banner.js';

const port = Number(process.env.PORT) || 3001;
const store = openStore();
const app = createApp(store);
const dev = process.argv.includes('--dev');   // `pnpm dev` passes --dev: Vite serves the UI, this process is only the API
app.listen(port, () => {
  if (app.locals.hasUi && !dev) {
    console.log(banner(['Strata is running', '', `Open the app:   http://localhost:${port}`, `Data:           ${process.env.STRATA_DB || './data/strata.db'}`, ...(process.env.STRATA_PASSWORD ? [`Login:          required (user "${process.env.STRATA_USER || 'strata'}")`] : [])]));
  } else {
    // Dev mode: this process is only the API; Vite serves the UI (and prints its own banner when it is ready).
    console.log(`[api] ready on http://localhost:${port}  (API only: the web app is on http://localhost:5173)`);
  }
});
