import app from './app.js';
import { config } from './config.js';
import { connectDatabase } from './database.js';

async function main() {
  await connectDatabase();
  app.listen(config.port, () => console.log(`API en http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
