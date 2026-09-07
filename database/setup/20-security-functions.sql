

--
-- Name: has_capability(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_capability(p_capability text) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_user_id UUID := NULLIF(current_setting('app.user_id', true), '')::UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN role_capabilities rc ON rc.role_id = ur.role_id
        WHERE ur.user_id = v_user_id AND rc.capability = p_capability
    );
END;
$$;


--
-- Name: has_permission(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_permission(p_object_id uuid, p_action text) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_user_id UUID := NULLIF(current_setting('app.user_id', true), '')::UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM object_permission_candidates(p_object_id) c
        JOIN user_roles ur ON ur.user_id = v_user_id
        WHERE EXISTS (
            SELECT 1
            FROM permissions p
            JOIN groups g ON g.id = p.group_id
            WHERE p.role_id = ur.role_id
              AND p.action = p_action
              AND p.group_id = c
        )
        OR EXISTS (
            SELECT 1
            FROM role_object_grants g
            WHERE g.role_id = ur.role_id
              AND g.object_id = c
              AND g.action = p_action
        )
    );
END;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_user_id UUID := NULLIF(current_setting('app.user_id', true), '')::UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = v_user_id AND r.name = 'admin'
    );
END;
$$;


--
-- Name: is_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_owner(p_object_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_user_id UUID := NULLIF(current_setting('app.user_id', true), '')::UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM objects o
        WHERE o.id = p_object_id AND o.owner_id = v_user_id
    );
END;
$$;


--
-- Name: object_can(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.object_can(p_object_id uuid, p_action text, p_user uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_user_id UUID := COALESCE(p_user, session_user_id());
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    IF user_is_admin(v_user_id) THEN
        RETURN TRUE;
    END IF;
    IF p_action = 'read' AND user_is_owner(p_object_id, v_user_id) THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM object_permission_candidates(p_object_id) c
        JOIN user_roles ur ON ur.user_id = v_user_id
        WHERE EXISTS (
            SELECT 1
            FROM permissions p
            JOIN groups g ON g.id = p.group_id
            WHERE p.role_id = ur.role_id
              AND p.action = p_action
              AND p.group_id = c
        )
        OR EXISTS (
            SELECT 1
            FROM role_object_grants g
            WHERE g.role_id = ur.role_id
              AND g.object_id = c
              AND g.action = p_action
        )
    );
END;
$$;


--
-- Name: object_permission_candidates(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.object_permission_candidates(p_object_id uuid) RETURNS SETOF uuid
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_candidates uuid[] := ARRAY[p_object_id];
    v_frontier   uuid[] := ARRAY[p_object_id];
    v_new        uuid[] := ARRAY[]::uuid[];
    v_current    uuid;
    v_parent     uuid;
    v_group      uuid;
    _i           integer;
BEGIN
    SELECT COALESCE(array_agg(g.id), ARRAY[]::uuid[]) INTO v_candidates
    FROM groups g
    WHERE g.is_system = true;

    IF v_candidates IS NULL THEN
        v_candidates := ARRAY[]::uuid[];
    END IF;
    IF NOT (p_object_id = ANY (v_candidates)) THEN
        v_candidates := array_append(v_candidates, p_object_id);
    END IF;
    v_frontier := ARRAY[p_object_id];

    FOR _i IN 1..16 LOOP
        v_new := ARRAY[]::uuid[];
        FOREACH v_current IN ARRAY v_frontier LOOP
            SELECT o.parent_id INTO v_parent FROM objects o WHERE o.id = v_current;
            IF v_parent IS NOT NULL AND NOT (v_parent = ANY (v_candidates)) THEN
                v_new := array_append(v_new, v_parent);
                v_candidates := array_append(v_candidates, v_parent);
            END IF;

            FOR v_group IN
                SELECT m.group_id FROM group_members m WHERE m.object_id = v_current
            LOOP
                IF NOT (v_group = ANY (v_candidates)) THEN
                    v_new := array_append(v_new, v_group);
                    v_candidates := array_append(v_candidates, v_group);
                END IF;
            END LOOP;
        END LOOP;

        IF v_new = ARRAY[]::uuid[] THEN
            EXIT;
        END IF;
        v_frontier := v_new;
    END LOOP;

    RETURN QUERY SELECT unnest(v_candidates);
END;
$$;


--
-- Name: session_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.session_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;


--
-- Name: user_has_permission(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_has_permission(p_object_id uuid, p_action text, p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT p_user IS NOT NULL AND EXISTS (
        SELECT 1
        FROM object_permission_candidates(p_object_id) c
        JOIN user_roles ur ON ur.user_id = p_user
        WHERE EXISTS (
            SELECT 1
            FROM permissions p
            JOIN groups g ON g.id = p.group_id
            WHERE p.role_id = ur.role_id
              AND p.action = p_action
              AND p.group_id = c
        )
        OR EXISTS (
            SELECT 1
            FROM role_object_grants g
            WHERE g.role_id = ur.role_id
              AND g.object_id = c
              AND g.action = p_action
        )
    );
$$;


--
-- Name: user_is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_admin(p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT p_user IS NOT NULL AND EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = p_user AND r.name = 'admin'
    );
$$;


--
-- Name: user_is_owner(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_owner(p_object_id uuid, p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT p_user IS NOT NULL
       AND EXISTS (SELECT 1 FROM objects o WHERE o.id = p_object_id AND o.owner_id = p_user)
       -- Владелец не должен «просачиваться» через системные корневые группы;
       -- bootstrap сохраняется только пока в объект явно ничего не включено.
       AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.object_id = p_object_id)
$$;
