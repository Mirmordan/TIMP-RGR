

--
-- Name: objects_admin_display_name(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.objects_admin_display_name(p_object_id uuid) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT NULLIF(o.name, '') FROM objects o WHERE o.id = p_object_id;
$$;


--
-- Name: objects_admin_parent_type(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.objects_admin_parent_type(p_object_id uuid) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT o2.type
    FROM objects o1
    JOIN objects o2 ON o2.id = o1.parent_id
    WHERE o1.id = p_object_id;
$$;


--
-- Name: objects_display_name(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.objects_display_name(p_object_id uuid) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT objects_admin_display_name(p_object_id);
$$;
