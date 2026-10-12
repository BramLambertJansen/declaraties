--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11 (Debian 17.11-1.pgdg12+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg12+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: app_migrator
--

CREATE SCHEMA app;


ALTER SCHEMA app OWNER TO app_migrator;

--
-- Name: better_auth; Type: SCHEMA; Schema: -; Owner: app_migrator
--

CREATE SCHEMA better_auth;


ALTER SCHEMA better_auth OWNER TO app_migrator;

--
-- Name: assign_role(text, text); Type: FUNCTION; Schema: app; Owner: app_definer
--

CREATE FUNCTION app.assign_role(p_user_id text, p_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  declare
    v_previous text;
  begin
    if not app.is_mfa_admin()
       and not (session_user = 'app_migrator' and app.current_user_id() is null) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    select r.role into v_previous from public.user_roles r where r.user_id = p_user_id for update;
    insert into public.user_roles (user_id, role) values (p_user_id, p_role)
      on conflict (user_id) do update set role = excluded.role;
    if v_previous is distinct from p_role then
      insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
        values (
          app.current_user_id(), 'core.role.assign', 'account', p_user_id, app.request_id(),
          case when v_previous is null
            then pg_catalog.jsonb_build_object('role', p_role)
            else pg_catalog.jsonb_build_object('role', p_role, 'previous', v_previous)
          end
        );
    end if;
  end
  $$;


ALTER FUNCTION app.assign_role(p_user_id text, p_role text) OWNER TO app_definer;

--
-- Name: audit(text, text, text, jsonb); Type: FUNCTION; Schema: app; Owner: app_definer
--

CREATE FUNCTION app.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  begin
    if app.current_user_id() is null then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p_action like 'core.%' or p_target_type = 'account' then
      raise exception 'voorbehouden actie of doeltype' using errcode = '22023';
    end if;
    insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
      values (app.current_user_id(), p_action, p_target_type, p_target_id, app.request_id(), p_details);
  end
  $$;


ALTER FUNCTION app.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb) OWNER TO app_definer;

--
-- Name: audit_account_action(text, text); Type: FUNCTION; Schema: app; Owner: app_definer
--

CREATE FUNCTION app.audit_account_action(p_action text, p_target_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  begin
    if not app.is_mfa_admin() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p_action is null or p_action not in (
      'core.account.invite', 'core.account.reinvite', 'core.account.revoke', 'core.account.reset_link'
    ) then
      raise exception 'onbekende accountactie' using errcode = '22023';
    end if;
    insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
      values (app.current_user_id(), p_action, 'account', p_target_id, app.request_id(), '{}'::jsonb);
  end
  $$;


ALTER FUNCTION app.audit_account_action(p_action text, p_target_id text) OWNER TO app_definer;

--
-- Name: audit_log_guard(); Type: FUNCTION; Schema: app; Owner: app_definer
--

CREATE FUNCTION app.audit_log_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  begin
    raise exception 'audit log is append-only' using errcode = '42501';
  end
  $$;


ALTER FUNCTION app.audit_log_guard() OWNER TO app_definer;

--
-- Name: consume_rate_limit(text, integer, integer); Type: FUNCTION; Schema: app; Owner: app_definer
--

CREATE FUNCTION app.consume_rate_limit(p_bucket text, p_window_seconds integer, p_max integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  declare
    v_user text := app.current_user_id();
    v_window interval;
    v_start timestamptz;
    v_hits integer;
  begin
    if v_user is null then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p_window_seconds is null or p_window_seconds <= 0 or p_max is null or p_max <= 0
       or p_bucket is null or p_bucket = '' or pg_catalog.strpos(p_bucket, ':') > 0 then
      raise exception 'ongeldige rate limit' using errcode = '22023';
    end if;
    v_window := pg_catalog.make_interval(secs => p_window_seconds);
    insert into app.rate_limits (key, window_start, hits)
      values (p_bucket || ':' || v_user, pg_catalog.now(), 1)
      on conflict (key) do update
        set window_start = case when rate_limits.window_start + v_window <= pg_catalog.now()
                                then pg_catalog.now() else rate_limits.window_start end,
            hits = case when rate_limits.window_start + v_window <= pg_catalog.now()
                        then 1 else rate_limits.hits + 1 end
      returning window_start, hits into v_start, v_hits;
    if v_hits <= p_max then
      return 0;
    end if;
    return greatest(1, pg_catalog.ceil(pg_catalog.date_part('epoch', v_start + v_window - pg_catalog.now()))::integer);
  end
  $$;


ALTER FUNCTION app.consume_rate_limit(p_bucket text, p_window_seconds integer, p_max integer) OWNER TO app_definer;

--
-- Name: current_user_id(); Type: FUNCTION; Schema: app; Owner: app_migrator
--

CREATE FUNCTION app.current_user_id() RETURNS text
    LANGUAGE sql STABLE
    RETURN NULLIF(current_setting('app.user_id'::text, true), ''::text);


ALTER FUNCTION app.current_user_id() OWNER TO app_migrator;

--
-- Name: is_mfa_admin(); Type: FUNCTION; Schema: app; Owner: app_definer
--

CREATE FUNCTION app.is_mfa_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select app.session_strength() = 'mfa'
       and exists (select 1 from public.user_roles r where r.user_id = app.current_user_id() and r.role = 'admin')
  $$;


ALTER FUNCTION app.is_mfa_admin() OWNER TO app_definer;

--
-- Name: request_id(); Type: FUNCTION; Schema: app; Owner: app_migrator
--

CREATE FUNCTION app.request_id() RETURNS text
    LANGUAGE sql STABLE
    RETURN NULLIF(current_setting('app.request_id'::text, true), ''::text);


ALTER FUNCTION app.request_id() OWNER TO app_migrator;

--
-- Name: session_strength(); Type: FUNCTION; Schema: app; Owner: app_migrator
--

CREATE FUNCTION app.session_strength() RETURNS text
    LANGUAGE sql STABLE
    RETURN COALESCE(NULLIF(current_setting('app.session_strength'::text, true), ''::text), 'none'::text);


ALTER FUNCTION app.session_strength() OWNER TO app_migrator;

--
-- Name: set_account_blocked(text, boolean); Type: FUNCTION; Schema: app; Owner: app_definer
--

CREATE FUNCTION app.set_account_blocked(p_user_id text, p_blocked boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  declare
    v_blocked_at timestamptz;
  begin
    if not app.is_mfa_admin() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    select u.blocked_at into v_blocked_at from better_auth."user" u where u.id = p_user_id;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if not p_blocked then
      if v_blocked_at is not null then
        update better_auth."user" set blocked_at = null where id = p_user_id;
        insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
          values (app.current_user_id(), 'core.account.unblock', 'account', p_user_id, app.request_id(), '{}'::jsonb);
      end if;
      return;
    end if;
    if p_user_id = app.current_user_id() then
      raise exception 'OWN_ACCOUNT';
    end if;
    if not exists (
      select 1 from better_auth.account a where a."userId" = p_user_id and a."providerId" = 'credential'
    ) then
      raise exception 'ACCOUNT_INVITED';
    end if;
    if v_blocked_at is not null then
      return;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
    update better_auth."user" set blocked_at = pg_catalog.now() where id = p_user_id and blocked_at is null;
    if not exists (
      select 1
      from public.user_roles r
      join better_auth."user" u on u.id = r.user_id
      where r.role = 'admin'
        and u.blocked_at is null
        and exists (
          select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential'
        )
    ) then
      raise exception 'LAST_ADMIN' using detail = 'De laatste admin kan niet weg.';
    end if;
    insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
      values (app.current_user_id(), 'core.account.block', 'account', p_user_id, app.request_id(), '{}'::jsonb);
  end
  $$;


ALTER FUNCTION app.set_account_blocked(p_user_id text, p_blocked boolean) OWNER TO app_definer;

--
-- Name: user_roles_keep_one_admin(); Type: FUNCTION; Schema: app; Owner: app_definer
--

CREATE FUNCTION app.user_roles_keep_one_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  begin
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
    if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') and not exists (
      select 1
      from public.user_roles r
      join better_auth."user" u on u.id = r.user_id
      where r.role = 'admin'
        and u.blocked_at is null
        and exists (
          select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential'
        )
    ) then
      raise exception 'LAST_ADMIN' using errcode = 'P0001', detail = 'De laatste admin kan niet weg.';
    end if;
    return null;
  end
  $$;


ALTER FUNCTION app.user_roles_keep_one_admin() OWNER TO app_definer;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: better_auth; Owner: app_migrator
--

CREATE TABLE better_auth.account (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE better_auth.account OWNER TO app_migrator;

--
-- Name: user; Type: TABLE; Schema: better_auth; Owner: app_migrator
--

CREATE TABLE better_auth."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "twoFactorEnabled" boolean,
    blocked_at timestamp with time zone
);


ALTER TABLE better_auth."user" OWNER TO app_migrator;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: app_migrator
--

CREATE TABLE public.user_roles (
    user_id text NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_roles_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text])))
);

ALTER TABLE ONLY public.user_roles FORCE ROW LEVEL SECURITY;


ALTER TABLE public.user_roles OWNER TO app_migrator;

--
-- Name: accounts; Type: VIEW; Schema: app; Owner: app_definer
--

CREATE VIEW app.accounts WITH (security_barrier='true') AS
 SELECT u.id,
    u.name,
    u.email,
    r.role,
        CASE
            WHEN (u.blocked_at IS NOT NULL) THEN 'blocked'::text
            WHEN (EXISTS ( SELECT 1
               FROM better_auth.account a
              WHERE ((a."userId" = u.id) AND (a."providerId" = 'credential'::text)))) THEN 'active'::text
            ELSE 'invited'::text
        END AS status,
    u."createdAt" AS created_at
   FROM (better_auth."user" u
     JOIN public.user_roles r ON ((r.user_id = u.id)))
  WHERE ( SELECT app.is_mfa_admin() AS is_mfa_admin);


ALTER VIEW app.accounts OWNER TO app_definer;

--
-- Name: audit_log; Type: TABLE; Schema: app; Owner: app_migrator
--

CREATE TABLE app.audit_log (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id text,
    db_role text DEFAULT SESSION_USER NOT NULL,
    action text NOT NULL,
    target_type text,
    target_id text,
    request_id text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT audit_log_action_check CHECK ((action ~ '^[a-z]+(\.[a-z_]+)+$'::text)),
    CONSTRAINT audit_log_details_check CHECK (((jsonb_typeof(details) = 'object'::text) AND (octet_length((details)::text) <= 2048))),
    CONSTRAINT audit_log_target_id_check CHECK ((target_id ~ '^[A-Za-z0-9_.:-]{1,128}$'::text)),
    CONSTRAINT audit_log_target_type_check CHECK ((target_type ~ '^[a-z_]+$'::text))
);

ALTER TABLE ONLY app.audit_log FORCE ROW LEVEL SECURITY;


ALTER TABLE app.audit_log OWNER TO app_migrator;

--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: app; Owner: app_migrator
--

ALTER TABLE app.audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME app.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rate_limits; Type: TABLE; Schema: app; Owner: app_migrator
--

CREATE UNLOGGED TABLE app.rate_limits (
    key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    hits integer NOT NULL,
    CONSTRAINT rate_limits_hits_check CHECK ((hits > 0))
);

ALTER TABLE ONLY app.rate_limits FORCE ROW LEVEL SECURITY;


ALTER TABLE app.rate_limits OWNER TO app_migrator;

--
-- Name: rateLimit; Type: TABLE; Schema: better_auth; Owner: app_migrator
--

CREATE TABLE better_auth."rateLimit" (
    id text NOT NULL,
    key text NOT NULL,
    count integer NOT NULL,
    "lastRequest" bigint NOT NULL
);


ALTER TABLE better_auth."rateLimit" OWNER TO app_migrator;

--
-- Name: session; Type: TABLE; Schema: better_auth; Owner: app_migrator
--

CREATE TABLE better_auth.session (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL,
    session_strength text DEFAULT 'password'::text NOT NULL,
    CONSTRAINT session_strength_check CHECK ((session_strength = ANY (ARRAY['password'::text, 'mfa'::text])))
);


ALTER TABLE better_auth.session OWNER TO app_migrator;

--
-- Name: twoFactor; Type: TABLE; Schema: better_auth; Owner: app_migrator
--

CREATE TABLE better_auth."twoFactor" (
    id text NOT NULL,
    secret text NOT NULL,
    "backupCodes" text NOT NULL,
    "userId" text NOT NULL,
    verified boolean,
    "failedVerificationCount" integer,
    "lockedUntil" timestamp with time zone
);


ALTER TABLE better_auth."twoFactor" OWNER TO app_migrator;

--
-- Name: verification; Type: TABLE; Schema: better_auth; Owner: app_migrator
--

CREATE TABLE better_auth.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE better_auth.verification OWNER TO app_migrator;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: app_migrator
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO app_migrator;

--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: app; Owner: app_migrator
--

ALTER TABLE ONLY app.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: app; Owner: app_migrator
--

ALTER TABLE ONLY app.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: rateLimit rateLimit_key_key; Type: CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth."rateLimit"
    ADD CONSTRAINT "rateLimit_key_key" UNIQUE (key);


--
-- Name: rateLimit rateLimit_pkey; Type: CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth."rateLimit"
    ADD CONSTRAINT "rateLimit_pkey" PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- Name: twoFactor twoFactor_pkey; Type: CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth."twoFactor"
    ADD CONSTRAINT "twoFactor_pkey" PRIMARY KEY (id);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: app_migrator
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: app_migrator
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id);


--
-- Name: audit_log_actor_idx; Type: INDEX; Schema: app; Owner: app_migrator
--

CREATE INDEX audit_log_actor_idx ON app.audit_log USING btree (actor_id, at);


--
-- Name: audit_log_target_idx; Type: INDEX; Schema: app; Owner: app_migrator
--

CREATE INDEX audit_log_target_idx ON app.audit_log USING btree (target_type, target_id, at);


--
-- Name: account_userId_idx; Type: INDEX; Schema: better_auth; Owner: app_migrator
--

CREATE INDEX "account_userId_idx" ON better_auth.account USING btree ("userId");


--
-- Name: session_userId_idx; Type: INDEX; Schema: better_auth; Owner: app_migrator
--

CREATE INDEX "session_userId_idx" ON better_auth.session USING btree ("userId");


--
-- Name: twoFactor_secret_idx; Type: INDEX; Schema: better_auth; Owner: app_migrator
--

CREATE INDEX "twoFactor_secret_idx" ON better_auth."twoFactor" USING btree (secret);


--
-- Name: twoFactor_userId_idx; Type: INDEX; Schema: better_auth; Owner: app_migrator
--

CREATE INDEX "twoFactor_userId_idx" ON better_auth."twoFactor" USING btree ("userId");


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: better_auth; Owner: app_migrator
--

CREATE INDEX verification_identifier_idx ON better_auth.verification USING btree (identifier);


--
-- Name: audit_log audit_log_no_delete; Type: TRIGGER; Schema: app; Owner: app_migrator
--

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON app.audit_log FOR EACH STATEMENT EXECUTE FUNCTION app.audit_log_guard();


--
-- Name: audit_log audit_log_no_truncate; Type: TRIGGER; Schema: app; Owner: app_migrator
--

CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON app.audit_log FOR EACH STATEMENT EXECUTE FUNCTION app.audit_log_guard();


--
-- Name: audit_log audit_log_no_update; Type: TRIGGER; Schema: app; Owner: app_migrator
--

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON app.audit_log FOR EACH STATEMENT EXECUTE FUNCTION app.audit_log_guard();


--
-- Name: user_roles user_roles_keep_one_admin; Type: TRIGGER; Schema: public; Owner: app_migrator
--

CREATE TRIGGER user_roles_keep_one_admin AFTER DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION app.user_roles_keep_one_admin();


--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES better_auth."user"(id) ON DELETE CASCADE;


--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES better_auth."user"(id) ON DELETE CASCADE;


--
-- Name: twoFactor twoFactor_userId_fkey; Type: FK CONSTRAINT; Schema: better_auth; Owner: app_migrator
--

ALTER TABLE ONLY better_auth."twoFactor"
    ADD CONSTRAINT "twoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES better_auth."user"(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: app_migrator
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES better_auth."user"(id) ON DELETE CASCADE;


--
-- Name: audit_log; Type: ROW SECURITY; Schema: app; Owner: app_migrator
--

ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_definer_insert; Type: POLICY; Schema: app; Owner: app_migrator
--

CREATE POLICY audit_log_definer_insert ON app.audit_log FOR INSERT TO app_definer WITH CHECK (true);


--
-- Name: audit_log audit_log_definer_select; Type: POLICY; Schema: app; Owner: app_migrator
--

CREATE POLICY audit_log_definer_select ON app.audit_log FOR SELECT TO app_definer USING (true);


--
-- Name: audit_log audit_log_select_admin; Type: POLICY; Schema: app; Owner: app_migrator
--

CREATE POLICY audit_log_select_admin ON app.audit_log FOR SELECT TO app_authenticated USING (( SELECT app.is_mfa_admin() AS is_mfa_admin));


--
-- Name: rate_limits; Type: ROW SECURITY; Schema: app; Owner: app_migrator
--

ALTER TABLE app.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits rate_limits_definer_all; Type: POLICY; Schema: app; Owner: app_migrator
--

CREATE POLICY rate_limits_definer_all ON app.rate_limits TO app_definer USING (true) WITH CHECK (true);


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: app_migrator
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_definer_all; Type: POLICY; Schema: public; Owner: app_migrator
--

CREATE POLICY user_roles_definer_all ON public.user_roles TO app_definer USING (true) WITH CHECK (true);


--
-- Name: user_roles user_roles_select_admin; Type: POLICY; Schema: public; Owner: app_migrator
--

CREATE POLICY user_roles_select_admin ON public.user_roles FOR SELECT TO app_authenticated USING (( SELECT app.is_mfa_admin() AS is_mfa_admin));


--
-- Name: user_roles user_roles_select_own; Type: POLICY; Schema: public; Owner: app_migrator
--

CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO app_authenticated USING ((user_id = ( SELECT app.current_user_id() AS current_user_id)));


--
-- Name: SCHEMA app; Type: ACL; Schema: -; Owner: app_migrator
--

GRANT USAGE ON SCHEMA app TO app_authenticated;
GRANT ALL ON SCHEMA app TO app_definer;


--
-- Name: SCHEMA better_auth; Type: ACL; Schema: -; Owner: app_migrator
--

GRANT USAGE ON SCHEMA better_auth TO auth_service;
GRANT USAGE ON SCHEMA better_auth TO app_definer;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_authenticated;
GRANT USAGE ON SCHEMA public TO app_definer;


--
-- Name: FUNCTION assign_role(p_user_id text, p_role text); Type: ACL; Schema: app; Owner: app_definer
--

REVOKE ALL ON FUNCTION app.assign_role(p_user_id text, p_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION app.assign_role(p_user_id text, p_role text) TO app_authenticated;
GRANT ALL ON FUNCTION app.assign_role(p_user_id text, p_role text) TO app_migrator;


--
-- Name: FUNCTION audit(p_action text, p_target_type text, p_target_id text, p_details jsonb); Type: ACL; Schema: app; Owner: app_definer
--

REVOKE ALL ON FUNCTION app.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION app.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb) TO app_authenticated;


--
-- Name: FUNCTION audit_account_action(p_action text, p_target_id text); Type: ACL; Schema: app; Owner: app_definer
--

REVOKE ALL ON FUNCTION app.audit_account_action(p_action text, p_target_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION app.audit_account_action(p_action text, p_target_id text) TO app_authenticated;


--
-- Name: FUNCTION audit_log_guard(); Type: ACL; Schema: app; Owner: app_definer
--

REVOKE ALL ON FUNCTION app.audit_log_guard() FROM PUBLIC;


--
-- Name: FUNCTION consume_rate_limit(p_bucket text, p_window_seconds integer, p_max integer); Type: ACL; Schema: app; Owner: app_definer
--

REVOKE ALL ON FUNCTION app.consume_rate_limit(p_bucket text, p_window_seconds integer, p_max integer) FROM PUBLIC;
GRANT ALL ON FUNCTION app.consume_rate_limit(p_bucket text, p_window_seconds integer, p_max integer) TO app_authenticated;


--
-- Name: FUNCTION current_user_id(); Type: ACL; Schema: app; Owner: app_migrator
--

REVOKE ALL ON FUNCTION app.current_user_id() FROM PUBLIC;
GRANT ALL ON FUNCTION app.current_user_id() TO app_authenticated;
GRANT ALL ON FUNCTION app.current_user_id() TO app_definer;


--
-- Name: FUNCTION is_mfa_admin(); Type: ACL; Schema: app; Owner: app_definer
--

REVOKE ALL ON FUNCTION app.is_mfa_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION app.is_mfa_admin() TO app_authenticated;


--
-- Name: FUNCTION request_id(); Type: ACL; Schema: app; Owner: app_migrator
--

REVOKE ALL ON FUNCTION app.request_id() FROM PUBLIC;
GRANT ALL ON FUNCTION app.request_id() TO app_definer;


--
-- Name: FUNCTION session_strength(); Type: ACL; Schema: app; Owner: app_migrator
--

REVOKE ALL ON FUNCTION app.session_strength() FROM PUBLIC;
GRANT ALL ON FUNCTION app.session_strength() TO app_authenticated;
GRANT ALL ON FUNCTION app.session_strength() TO app_definer;


--
-- Name: FUNCTION set_account_blocked(p_user_id text, p_blocked boolean); Type: ACL; Schema: app; Owner: app_definer
--

REVOKE ALL ON FUNCTION app.set_account_blocked(p_user_id text, p_blocked boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION app.set_account_blocked(p_user_id text, p_blocked boolean) TO app_authenticated;


--
-- Name: FUNCTION user_roles_keep_one_admin(); Type: ACL; Schema: app; Owner: app_definer
--

REVOKE ALL ON FUNCTION app.user_roles_keep_one_admin() FROM PUBLIC;


--
-- Name: TABLE account; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE better_auth.account TO auth_service;


--
-- Name: COLUMN account."providerId"; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT("providerId") ON TABLE better_auth.account TO app_definer;


--
-- Name: COLUMN account."userId"; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT("userId") ON TABLE better_auth.account TO app_definer;


--
-- Name: TABLE "user"; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE better_auth."user" TO auth_service;


--
-- Name: COLUMN "user".id; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT(id) ON TABLE better_auth."user" TO app_definer;


--
-- Name: COLUMN "user".name; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT(name) ON TABLE better_auth."user" TO app_definer;


--
-- Name: COLUMN "user".email; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT(email) ON TABLE better_auth."user" TO app_definer;


--
-- Name: COLUMN "user"."createdAt"; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT("createdAt") ON TABLE better_auth."user" TO app_definer;


--
-- Name: COLUMN "user".blocked_at; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT(blocked_at),UPDATE(blocked_at) ON TABLE better_auth."user" TO app_definer;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: app_migrator
--

GRANT SELECT ON TABLE public.user_roles TO app_authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.user_roles TO app_definer;


--
-- Name: TABLE accounts; Type: ACL; Schema: app; Owner: app_definer
--

GRANT SELECT ON TABLE app.accounts TO app_authenticated;


--
-- Name: TABLE audit_log; Type: ACL; Schema: app; Owner: app_migrator
--

GRANT SELECT ON TABLE app.audit_log TO app_definer;
GRANT SELECT ON TABLE app.audit_log TO app_authenticated;


--
-- Name: COLUMN audit_log.actor_id; Type: ACL; Schema: app; Owner: app_migrator
--

GRANT INSERT(actor_id) ON TABLE app.audit_log TO app_definer;


--
-- Name: COLUMN audit_log.action; Type: ACL; Schema: app; Owner: app_migrator
--

GRANT INSERT(action) ON TABLE app.audit_log TO app_definer;


--
-- Name: COLUMN audit_log.target_type; Type: ACL; Schema: app; Owner: app_migrator
--

GRANT INSERT(target_type) ON TABLE app.audit_log TO app_definer;


--
-- Name: COLUMN audit_log.target_id; Type: ACL; Schema: app; Owner: app_migrator
--

GRANT INSERT(target_id) ON TABLE app.audit_log TO app_definer;


--
-- Name: COLUMN audit_log.request_id; Type: ACL; Schema: app; Owner: app_migrator
--

GRANT INSERT(request_id) ON TABLE app.audit_log TO app_definer;


--
-- Name: COLUMN audit_log.details; Type: ACL; Schema: app; Owner: app_migrator
--

GRANT INSERT(details) ON TABLE app.audit_log TO app_definer;


--
-- Name: TABLE rate_limits; Type: ACL; Schema: app; Owner: app_migrator
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE app.rate_limits TO app_definer;


--
-- Name: TABLE "rateLimit"; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE better_auth."rateLimit" TO auth_service;


--
-- Name: TABLE session; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE better_auth.session TO auth_service;


--
-- Name: TABLE "twoFactor"; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE better_auth."twoFactor" TO auth_service;


--
-- Name: TABLE verification; Type: ACL; Schema: better_auth; Owner: app_migrator
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE better_auth.verification TO auth_service;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: better_auth; Owner: app_migrator
--

ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA better_auth GRANT SELECT,USAGE ON SEQUENCES TO auth_service;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: better_auth; Owner: app_migrator
--

ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA better_auth GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO auth_service;


--
-- Name: DEFAULT PRIVILEGES FOR TYPES; Type: DEFAULT ACL; Schema: -; Owner: app_migrator
--

ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator REVOKE ALL ON TYPES FROM PUBLIC;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: -; Owner: app_definer
--

ALTER DEFAULT PRIVILEGES FOR ROLE app_definer REVOKE ALL ON FUNCTIONS FROM PUBLIC;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: -; Owner: app_migrator
--

ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator REVOKE ALL ON FUNCTIONS FROM PUBLIC;


--
-- PostgreSQL database dump complete
--


