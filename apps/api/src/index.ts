import { createApp } from './app';

const PORT = process.env.PORT || 8080;
const app = createApp();

app.listen(PORT, () => {
  console.log(`[EscrowMind API] Server running on http://localhost:${PORT}`);
  console.log(`[EscrowMind API] Health check available at http://localhost:${PORT}/healthz`);
});
