-- RLS на объектных таблицах: админ видит всё, остальные — только строки с разрешением.
-- Все проверки идут через objects(id).
-- ВАЖНО: FORCE ROW LEVEL SECURITY — приложение подключается как владелец таблиц
-- (timprgr), а владельцы обходят RLS без FORCE. Без FORCE list/select вернёт все
-- строки даже для юзера без прав.

-- recording_devices
ALTER TABLE recording_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE recording_devices FORCE ROW LEVEL SECURITY;

CREATE POLICY devices_admin_all ON recording_devices
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY devices_read ON recording_devices
    FOR SELECT USING (has_permission(object_id, 'read'));

CREATE POLICY devices_write ON recording_devices
    FOR UPDATE USING (has_permission(object_id, 'write'))
    WITH CHECK (has_permission(object_id, 'write'));

CREATE POLICY devices_delete ON recording_devices
    FOR DELETE USING (has_permission(object_id, 'delete'));

-- recording_streams
ALTER TABLE recording_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE recording_streams FORCE ROW LEVEL SECURITY;

CREATE POLICY streams_admin_all ON recording_streams
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY streams_read ON recording_streams
    FOR SELECT USING (has_permission(object_id, 'read'));

CREATE POLICY streams_write ON recording_streams
    FOR UPDATE USING (has_permission(object_id, 'write'))
    WITH CHECK (has_permission(object_id, 'write'));

CREATE POLICY streams_delete ON recording_streams
    FOR DELETE USING (has_permission(object_id, 'delete'));

-- recording_processes
ALTER TABLE recording_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recording_processes FORCE ROW LEVEL SECURITY;

CREATE POLICY processes_admin_all ON recording_processes
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY processes_read ON recording_processes
    FOR SELECT USING (has_permission(object_id, 'read'));

CREATE POLICY processes_write ON recording_processes
    FOR UPDATE USING (has_permission(object_id, 'write'))
    WITH CHECK (has_permission(object_id, 'write'));

CREATE POLICY processes_delete ON recording_processes
    FOR DELETE USING (has_permission(object_id, 'delete'));

-- recording_chunks
ALTER TABLE recording_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE recording_chunks FORCE ROW LEVEL SECURITY;

CREATE POLICY chunks_admin_all ON recording_chunks
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY chunks_read ON recording_chunks
    FOR SELECT USING (has_permission(object_id, 'read'));

CREATE POLICY chunks_write ON recording_chunks
    FOR UPDATE USING (has_permission(object_id, 'write'))
    WITH CHECK (has_permission(object_id, 'write'));

CREATE POLICY chunks_delete ON recording_chunks
    FOR DELETE USING (has_permission(object_id, 'delete'));
