

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO timprgr_app;


--
-- Name: TABLE audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.audit_log TO timprgr_app;


--
-- Name: TABLE group_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.group_members TO timprgr_app;


--
-- Name: TABLE groups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.groups TO timprgr_app;


--
-- Name: TABLE objects; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.objects TO timprgr_app;


--
-- Name: TABLE permissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.permissions TO timprgr_app;


--
-- Name: TABLE recording_chunks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.recording_chunks TO timprgr_app;


--
-- Name: TABLE recording_devices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.recording_devices TO timprgr_app;


--
-- Name: TABLE recording_incidents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recording_incidents TO timprgr_app;


--
-- Name: TABLE recording_processes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.recording_processes TO timprgr_app;


--
-- Name: TABLE recording_segments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recording_segments TO timprgr_app;


--
-- Name: TABLE recording_streams; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.recording_streams TO timprgr_app;


--
-- Name: TABLE role_capabilities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.role_capabilities TO timprgr_app;


--
-- Name: TABLE role_object_grants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.role_object_grants TO timprgr_app;


--
-- Name: TABLE roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.roles TO timprgr_app;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_roles TO timprgr_app;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.users TO timprgr_app;
