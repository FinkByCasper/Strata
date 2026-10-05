import { openStore } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3001;
const store = openStore();
createApp(store).listen(port, () => console.log(`Strata listening on http://localhost:${port}`));
