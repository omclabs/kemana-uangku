-- Default admin user for the web frontend login (ADR-006).
-- Username: admin / Password: admin -- change via PUT /users/user-admin after first login.
INSERT INTO users (id, username, email, password_hash, is_active)
VALUES (
  'user-admin',
  'admin',
  'admin@kemana-uangku.local',
  '$2b$10$QjBGehZoncz48XTspt34PuX1UPkRIutS5akOV5fprLDafPCWhDNoW',
  1
);
