import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase";
import { authMiddleware } from "../middleware/auth";

const auth = new Hono();

// Sign up with email & password
auth.post("/signup", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm for now
  });

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  return c.json({ user: data.user }, 201);
});

// Sign in with email & password
auth.post("/login", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return c.json({ error: error.message }, 401);
  }

  return c.json({
    user: data.user,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
  });
});

// Refresh session
auth.post("/refresh", async (c) => {
  const { refresh_token } = await c.req.json();

  if (!refresh_token) {
    return c.json({ error: "Refresh token is required" }, 400);
  }

  const { data, error } = await supabaseAdmin.auth.refreshSession({
    refresh_token,
  });

  if (error) {
    return c.json({ error: error.message }, 401);
  }

  return c.json({
    session: {
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
      expires_at: data.session!.expires_at,
    },
  });
});

// Get current user (protected)
auth.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

// Logout (protected) - revokes the session server-side
auth.post("/logout", authMiddleware, async (c) => {
  const token = c.get("token");

  // Sign out the user's session
  await supabaseAdmin.auth.admin.signOut(token);

  return c.json({ message: "Logged out" });
});

export default auth;
