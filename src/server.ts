import "dotenv/config";
import express from "express";
import { chatRouter } from "./routes/chat";

const app = express();

app.use(express.json({ limit: "1mb" })); // read JSON bodies, max 1 MB

// Health check: "is the server alive?"
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(chatRouter);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`LLM gateway running on http://localhost:${PORT}`);
});
