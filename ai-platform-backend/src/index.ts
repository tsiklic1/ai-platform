import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import auth from "./routes/auth";
import skills from "./routes/skills";
import brands from "./routes/brands";
import brandProducts from "./routes/brand-products";
import contentTypes from "./routes/content-types";
import images from "./routes/images";
import texts from "./routes/texts";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/", (c) => {
  return c.json({ status: "ok", service: "ai-platform-backend" });
});

// Routes
app.route("/auth", auth);
app.route("/skills", skills);
app.route("/brands", brands);
app.route("/brands", brandProducts);
app.route("/brands", contentTypes);
app.route("/brands", images);
app.route("/brands", texts);

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};
