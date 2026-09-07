
ALTER TABLE ONLY public.recording_chunks FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.recording_devices FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.recording_incidents FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.recording_processes FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.recording_segments FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.recording_streams FORCE ROW LEVEL SECURITY;


--
-- Name: recording_chunks chunks_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chunks_admin_all ON public.recording_chunks FOR SELECT USING (public.is_admin());


--
-- Name: recording_chunks chunks_admin_all_d; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chunks_admin_all_d ON public.recording_chunks FOR DELETE USING (public.is_admin());


--
-- Name: recording_chunks chunks_admin_all_ud; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chunks_admin_all_ud ON public.recording_chunks FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: recording_chunks chunks_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chunks_delete ON public.recording_chunks FOR DELETE USING (public.has_permission(object_id, 'delete'::text));


--
-- Name: recording_chunks chunks_insert_capability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chunks_insert_capability ON public.recording_chunks FOR INSERT WITH CHECK ((public.is_admin() OR public.has_capability('chunk:create'::text)));


--
-- Name: recording_chunks chunks_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chunks_owner_read ON public.recording_chunks FOR SELECT USING ((public.is_owner(object_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE (gm.object_id = recording_chunks.object_id))))));


--
-- Name: recording_chunks chunks_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chunks_read ON public.recording_chunks FOR SELECT USING (public.has_permission(object_id, 'read'::text));


--
-- Name: recording_chunks chunks_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chunks_write ON public.recording_chunks FOR UPDATE USING (public.has_permission(object_id, 'write'::text)) WITH CHECK (public.has_permission(object_id, 'write'::text));


--
-- Name: recording_devices devices_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_admin_all ON public.recording_devices FOR SELECT USING (public.is_admin());


--
-- Name: recording_devices devices_admin_all_d; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_admin_all_d ON public.recording_devices FOR DELETE USING (public.is_admin());


--
-- Name: recording_devices devices_admin_all_ud; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_admin_all_ud ON public.recording_devices FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: recording_devices devices_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_delete ON public.recording_devices FOR DELETE USING (public.has_permission(object_id, 'delete'::text));


--
-- Name: recording_devices devices_insert_capability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_insert_capability ON public.recording_devices FOR INSERT WITH CHECK ((public.is_admin() OR public.has_capability('camera:create'::text)));


--
-- Name: recording_devices devices_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_owner_read ON public.recording_devices FOR SELECT USING ((public.is_owner(object_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE (gm.object_id = recording_devices.object_id))))));


--
-- Name: recording_devices devices_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_read ON public.recording_devices FOR SELECT USING (public.has_permission(object_id, 'read'::text));


--
-- Name: recording_devices devices_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_write ON public.recording_devices FOR UPDATE USING (public.has_permission(object_id, 'write'::text)) WITH CHECK (public.has_permission(object_id, 'write'::text));


--
-- Name: recording_incidents incidents_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY incidents_admin_read ON public.recording_incidents FOR SELECT USING (public.is_admin());


--
-- Name: recording_incidents incidents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY incidents_delete ON public.recording_incidents FOR DELETE USING ((public.is_admin() OR public.has_permission(object_id, 'delete'::text)));


--
-- Name: recording_incidents incidents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY incidents_insert ON public.recording_incidents FOR INSERT WITH CHECK ((public.is_admin() OR public.has_permission(object_id, 'write'::text)));


--
-- Name: recording_incidents incidents_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY incidents_read ON public.recording_incidents FOR SELECT USING ((public.has_permission(object_id, 'read'::text) OR public.is_owner(object_id)));


--
-- Name: recording_incidents incidents_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY incidents_write ON public.recording_incidents FOR UPDATE USING ((public.is_admin() OR public.has_permission(object_id, 'write'::text))) WITH CHECK ((public.is_admin() OR public.has_permission(object_id, 'write'::text)));


--
-- Name: recording_processes processes_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY processes_admin_all ON public.recording_processes FOR SELECT USING (public.is_admin());


--
-- Name: recording_processes processes_admin_all_d; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY processes_admin_all_d ON public.recording_processes FOR DELETE USING (public.is_admin());


--
-- Name: recording_processes processes_admin_all_ud; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY processes_admin_all_ud ON public.recording_processes FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: recording_processes processes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY processes_delete ON public.recording_processes FOR DELETE USING (public.has_permission(object_id, 'delete'::text));


--
-- Name: recording_processes processes_insert_capability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY processes_insert_capability ON public.recording_processes FOR INSERT WITH CHECK ((public.is_admin() OR public.has_capability('process:create'::text)));


--
-- Name: recording_processes processes_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY processes_owner_read ON public.recording_processes FOR SELECT USING ((public.is_owner(object_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE (gm.object_id = recording_processes.object_id))))));


--
-- Name: recording_processes processes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY processes_read ON public.recording_processes FOR SELECT USING (public.has_permission(object_id, 'read'::text));


--
-- Name: recording_processes processes_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY processes_write ON public.recording_processes FOR UPDATE USING (public.has_permission(object_id, 'write'::text)) WITH CHECK (public.has_permission(object_id, 'write'::text));


--
-- Name: recording_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recording_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: recording_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recording_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: recording_incidents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recording_incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: recording_processes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recording_processes ENABLE ROW LEVEL SECURITY;

--
-- Name: recording_segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recording_segments ENABLE ROW LEVEL SECURITY;

--
-- Name: recording_streams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recording_streams ENABLE ROW LEVEL SECURITY;

--
-- Name: recording_segments segments_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segments_admin_all ON public.recording_segments FOR SELECT USING (public.is_admin());


--
-- Name: recording_segments segments_admin_all_d; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segments_admin_all_d ON public.recording_segments FOR DELETE USING (public.is_admin());


--
-- Name: recording_segments segments_admin_all_ud; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segments_admin_all_ud ON public.recording_segments FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: recording_segments segments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segments_delete ON public.recording_segments FOR DELETE USING (public.has_permission(object_id, 'delete'::text));


--
-- Name: recording_segments segments_insert_capability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segments_insert_capability ON public.recording_segments FOR INSERT WITH CHECK ((public.is_admin() OR public.has_capability('process:create'::text)));


--
-- Name: recording_segments segments_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segments_owner_read ON public.recording_segments FOR SELECT USING ((public.is_owner(object_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE (gm.object_id = recording_segments.object_id))))));


--
-- Name: recording_segments segments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segments_read ON public.recording_segments FOR SELECT USING (public.has_permission(object_id, 'read'::text));


--
-- Name: recording_segments segments_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segments_write ON public.recording_segments FOR UPDATE USING (public.has_permission(object_id, 'write'::text)) WITH CHECK (public.has_permission(object_id, 'write'::text));


--
-- Name: recording_streams streams_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_admin_all ON public.recording_streams FOR SELECT USING (public.is_admin());


--
-- Name: recording_streams streams_admin_all_d; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_admin_all_d ON public.recording_streams FOR DELETE USING (public.is_admin());


--
-- Name: recording_streams streams_admin_all_ud; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_admin_all_ud ON public.recording_streams FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: recording_streams streams_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_delete ON public.recording_streams FOR DELETE USING (public.has_permission(object_id, 'delete'::text));


--
-- Name: recording_streams streams_insert_capability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_insert_capability ON public.recording_streams FOR INSERT WITH CHECK ((public.is_admin() OR public.has_capability('stream:create'::text)));


--
-- Name: recording_streams streams_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_owner_read ON public.recording_streams FOR SELECT USING ((public.is_owner(object_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE (gm.object_id = recording_streams.object_id))))));


--
-- Name: recording_streams streams_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_read ON public.recording_streams FOR SELECT USING (public.has_permission(object_id, 'read'::text));


--
-- Name: recording_streams streams_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_write ON public.recording_streams FOR UPDATE USING (public.has_permission(object_id, 'write'::text)) WITH CHECK (public.has_permission(object_id, 'write'::text));
