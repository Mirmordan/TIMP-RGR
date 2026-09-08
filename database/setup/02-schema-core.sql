--
-- PostgreSQL database dump
--

\restrict lZ4oifwqMLinpU5Ikrt6YjEhGrr3ogECAM3FeHDhO1LvyIqR6Hpwe3mjpqiNXP5

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    actor_name text,
    action text NOT NULL,
    target_type text,
    target_id text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    group_id uuid NOT NULL,
    object_id uuid NOT NULL
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_system boolean DEFAULT false NOT NULL
);


--
-- Name: objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT ''::text NOT NULL,
    name text,
    description text,
    parent_id uuid,
    owner_id uuid,
    CONSTRAINT objects_user_entity_name_required CHECK (((type <> ALL (ARRAY['device'::text, 'stream'::text, 'process'::text])) OR (NULLIF(name, ''::text) IS NOT NULL)))
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    group_id uuid NOT NULL,
    action text NOT NULL,
    CONSTRAINT permissions_action_check CHECK ((action = ANY (ARRAY['read'::text, 'write'::text, 'delete'::text])))
);


--
-- Name: recording_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recording_chunks (
    object_id uuid NOT NULL,
    process_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone NOT NULL,
    url text NOT NULL,
    CONSTRAINT recording_chunks_check CHECK ((ended_at >= started_at))
);


--
-- Name: recording_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recording_devices (
    object_id uuid NOT NULL,
    type text NOT NULL
);


--
-- Name: recording_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recording_incidents (
    object_id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    segment_id uuid,
    time_offset_s real DEFAULT 0 NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT recording_incidents_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])))
);


--
-- Name: recording_processes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recording_processes (
    object_id uuid NOT NULL,
    stream_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    status text NOT NULL,
    CONSTRAINT recording_processes_status_check CHECK ((status = ANY (ARRAY['running'::text, 'stopped'::text, 'failed'::text])))
);


--
-- Name: recording_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recording_segments (
    object_id uuid NOT NULL,
    process_id uuid NOT NULL,
    stream_id uuid NOT NULL,
    path text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    file_count integer DEFAULT 0 NOT NULL,
    duration_s real DEFAULT 0 NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    CONSTRAINT recording_segments_check CHECK ((ended_at >= started_at)),
    CONSTRAINT recording_segments_duration_s_check CHECK ((duration_s >= (0)::double precision))
);


--
-- Name: recording_streams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recording_streams (
    object_id uuid NOT NULL,
    url text NOT NULL,
    device_id uuid,
    source_fingerprint text
);


--
-- Name: role_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_capabilities (
    role_id uuid NOT NULL,
    capability text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT role_capabilities_capability_check CHECK ((capability = ANY (ARRAY['admin:read'::text, 'admin:write'::text, 'audit:delete'::text, 'audit:read'::text, 'camera:create'::text, 'chunk:create'::text, 'dashboard:read'::text, 'group:create'::text, 'group:delete'::text, 'group:read'::text, 'group:update'::text, 'media:export'::text, 'permission:manage'::text, 'permission:read'::text, 'process:create'::text, 'role:create'::text, 'role:delete'::text, 'role:read'::text, 'role:update'::text, 'stream:create'::text, 'user:create'::text, 'user:delete'::text, 'user:password:reset'::text, 'user:read'::text, 'user:update'::text])))
);


--
-- Name: role_object_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_object_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    object_id uuid NOT NULL,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT role_object_grants_action_check CHECK ((action = ANY (ARRAY['read'::text, 'write'::text, 'delete'::text])))
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    password_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (group_id, object_id);


--
-- Name: groups groups_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_name_key UNIQUE (name);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_role_id_group_id_action_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_role_id_group_id_action_key UNIQUE (role_id, group_id, action);


--
-- Name: recording_chunks recording_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_chunks
    ADD CONSTRAINT recording_chunks_pkey PRIMARY KEY (object_id);


--
-- Name: recording_devices recording_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_devices
    ADD CONSTRAINT recording_devices_pkey PRIMARY KEY (object_id);


--
-- Name: recording_incidents recording_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_incidents
    ADD CONSTRAINT recording_incidents_pkey PRIMARY KEY (object_id);


--
-- Name: recording_processes recording_processes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_processes
    ADD CONSTRAINT recording_processes_pkey PRIMARY KEY (object_id);


--
-- Name: recording_segments recording_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_segments
    ADD CONSTRAINT recording_segments_pkey PRIMARY KEY (object_id);


--
-- Name: recording_streams recording_streams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_streams
    ADD CONSTRAINT recording_streams_pkey PRIMARY KEY (object_id);


--
-- Name: role_capabilities role_capabilities_role_id_capability_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_capabilities
    ADD CONSTRAINT role_capabilities_role_id_capability_key UNIQUE (role_id, capability);


--
-- Name: role_object_grants role_object_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_object_grants
    ADD CONSTRAINT role_object_grants_pkey PRIMARY KEY (id);


--
-- Name: role_object_grants role_object_grants_role_id_object_id_action_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_object_grants
    ADD CONSTRAINT role_object_grants_role_id_object_id_action_key UNIQUE (role_id, object_id, action);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: audit_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_action_idx ON public.audit_log USING btree (action);


--
-- Name: audit_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_created_idx ON public.audit_log USING btree (created_at DESC);


--
-- Name: idx_group_members_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_group ON public.group_members USING btree (group_id, object_id);


--
-- Name: idx_group_members_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_object ON public.group_members USING btree (object_id, group_id);


--
-- Name: idx_groups_is_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_is_system ON public.groups USING btree (is_system) WHERE (is_system = true);


--
-- Name: idx_incidents_process; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidents_process ON public.recording_incidents USING btree (process_id);


--
-- Name: idx_incidents_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidents_time ON public.recording_incidents USING btree (process_id, time_offset_s);


--
-- Name: idx_objects_group_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objects_group_type ON public.objects USING btree (name) WHERE (type = 'group'::text);


--
-- Name: idx_objects_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objects_owner ON public.objects USING btree (owner_id);


--
-- Name: idx_objects_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objects_parent ON public.objects USING btree (parent_id);


--
-- Name: idx_objects_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objects_type ON public.objects USING btree (type);


--
-- Name: idx_permissions_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permissions_group ON public.permissions USING btree (group_id, role_id);


--
-- Name: idx_permissions_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permissions_role ON public.permissions USING btree (role_id, group_id);


--
-- Name: idx_role_capabilities_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_capabilities_role ON public.role_capabilities USING btree (role_id);


--
-- Name: idx_role_object_grants_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_object_grants_object ON public.role_object_grants USING btree (object_id);


--
-- Name: idx_role_object_grants_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_object_grants_role ON public.role_object_grants USING btree (role_id);


--
-- Name: idx_segments_process; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_segments_process ON public.recording_segments USING btree (process_id);


--
-- Name: idx_segments_stream; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_segments_stream ON public.recording_segments USING btree (stream_id);


--
-- Name: idx_segments_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_segments_time ON public.recording_segments USING btree (started_at, ended_at);


--
-- Name: idx_user_roles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role ON public.user_roles USING btree (role_id, user_id);


--
-- Name: idx_user_roles_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user ON public.user_roles USING btree (user_id, role_id);


--
-- Name: objects_group_object_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX objects_group_object_uniq ON public.objects USING btree (id) WHERE (type = 'group'::text);


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.objects(id) ON DELETE CASCADE;


--
-- Name: objects objects_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: objects objects_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.objects(id) ON DELETE SET NULL;


--
-- Name: permissions permissions_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: permissions permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: recording_chunks recording_chunks_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_chunks
    ADD CONSTRAINT recording_chunks_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.objects(id) ON DELETE CASCADE;


--
-- Name: recording_chunks recording_chunks_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_chunks
    ADD CONSTRAINT recording_chunks_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.recording_processes(object_id) ON DELETE CASCADE;


--
-- Name: recording_devices recording_devices_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_devices
    ADD CONSTRAINT recording_devices_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.objects(id) ON DELETE CASCADE;


--
-- Name: recording_incidents recording_incidents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_incidents
    ADD CONSTRAINT recording_incidents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: recording_incidents recording_incidents_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_incidents
    ADD CONSTRAINT recording_incidents_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.objects(id) ON DELETE CASCADE;


--
-- Name: recording_incidents recording_incidents_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_incidents
    ADD CONSTRAINT recording_incidents_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.recording_processes(object_id) ON DELETE CASCADE;


--
-- Name: recording_incidents recording_incidents_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_incidents
    ADD CONSTRAINT recording_incidents_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.recording_segments(object_id) ON DELETE SET NULL;


--
-- Name: recording_processes recording_processes_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_processes
    ADD CONSTRAINT recording_processes_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.objects(id) ON DELETE CASCADE;


--
-- Name: recording_processes recording_processes_stream_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_processes
    ADD CONSTRAINT recording_processes_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.recording_streams(object_id) ON DELETE CASCADE;


--
-- Name: recording_segments recording_segments_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_segments
    ADD CONSTRAINT recording_segments_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.objects(id) ON DELETE CASCADE;


--
-- Name: recording_segments recording_segments_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_segments
    ADD CONSTRAINT recording_segments_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.recording_processes(object_id) ON DELETE CASCADE;


--
-- Name: recording_segments recording_segments_stream_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_segments
    ADD CONSTRAINT recording_segments_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.recording_streams(object_id) ON DELETE CASCADE;


--
-- Name: recording_streams recording_streams_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_streams
    ADD CONSTRAINT recording_streams_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.recording_devices(object_id) ON DELETE SET NULL;


--
-- Name: recording_streams recording_streams_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_streams
    ADD CONSTRAINT recording_streams_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.objects(id) ON DELETE CASCADE;


--
-- Name: role_capabilities role_capabilities_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_capabilities
    ADD CONSTRAINT role_capabilities_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: role_object_grants role_object_grants_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_object_grants
    ADD CONSTRAINT role_object_grants_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.objects(id) ON DELETE CASCADE;


--
-- Name: role_object_grants role_object_grants_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_object_grants
    ADD CONSTRAINT role_object_grants_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict lZ4oifwqMLinpU5Ikrt6YjEhGrr3ogECAM3FeHDhO1LvyIqR6Hpwe3mjpqiNXP5

