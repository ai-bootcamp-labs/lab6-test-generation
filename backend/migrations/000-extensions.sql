/**
 * Initial schema setup. Idempotent.
 *  - `pgcrypto` for `gen_random_uuid()` and `digest()`
 *  - `citext`   for case-insensitive email storage
 *  - `auth` schema isolates auth domain from other application schemas
 */
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS auth;
