import { createSmsApp } from "./sms/app.js";

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const app = createSmsApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SMS ordering server running on http://localhost:${PORT}`);
});
