import express from "express";
import { processSmsMessage } from "./conversationEngine.js";

export const createSmsApp = () => {
  const app = express();
  app.use(express.json());

  app.post("/sms", (req, res) => {
    const { message, userId } = req.body ?? {};

    if (typeof message !== "string" || typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({
        reply: "Invalid request. Send JSON with string fields: message and userId.",
      });
    }

    const reply = processSmsMessage({
      message,
      userId: userId.trim(),
    });

    return res.json({ reply });
  });

  app.get("/test", (req, res) => {
    const { message, userId = "browser-user" } = req.query;

    if (typeof message === "string" && typeof userId === "string" && userId.trim()) {
      const reply = processSmsMessage({
        message,
        userId: userId.trim(),
      });

      return res.json({ reply });
    }

    return res.json({
      reply:
        'SMS server is running. Try: /test?userId=123&message=banner or POST /sms with {"message":"banner","userId":"123"}',
    });
  });

  return app;
};
