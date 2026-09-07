--
-- PostgreSQL database dump
--

\restrict RsTgtifYdoXO6D3ayPQfr1JjugFg9zmCNXToabY3SqQy0aQxLfbDalzhZ32vGy4

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
-- Data for Name: groups; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.groups DISABLE TRIGGER ALL;

INSERT INTO public.groups VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 'ground-floor', false);
INSERT INTO public.groups VALUES ('aaaaaaaa-0000-0000-0000-000000000003', 'archive', false);
INSERT INTO public.groups VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'all', true);


ALTER TABLE public.groups ENABLE TRIGGER ALL;

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.users DISABLE TRIGGER ALL;

INSERT INTO public.users VALUES ('22222222-2222-2222-2222-222222222222', 'bob', 'bob@example.com', '$2b$10$hyhYsZVtqSrlis.dphPi8eL9DbIUSa40YfTRmdlruNU1ZpVhF.GuC', '2026-08-31 10:58:38.824324+00');
INSERT INTO public.users VALUES ('11111111-1111-1111-1111-111111111111', 'alice', 'alice@example.com', '$2b$10$FL4qUY5ijBdm6OolXGGoKeR0m0h7KgpA/bvVbVfkVBOJjwAebvsS2', '2026-08-31 10:58:38.824324+00');
INSERT INTO public.users VALUES ('624e3d8c-e0ea-4388-9a69-587efb07f309', 'carol', 'carol@example.com', '$2b$10$hyhYsZVtqSrlis.dphPi8eL9DbIUSa40YfTRmdlruNU1ZpVhF.GuC', '2026-08-31 10:59:56.487864+00');


ALTER TABLE public.users ENABLE TRIGGER ALL;

--
-- Data for Name: objects; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.objects DISABLE TRIGGER ALL;

INSERT INTO public.objects VALUES ('8b6737af-133f-4811-bb5a-c4892adfa194', '2026-08-23 08:48:14.316353+00', 'device', 'ТРЦ Хан-Шатыр — Вход главный', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('71fb9850-3a47-4c9c-8b45-cbf41e6d41c9', '2026-08-30 21:26:53.829321+00', 'device', 'ТРЦ Хан-Шатыр — Эскалаторы', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('0eb35f7a-dfb3-4833-9d85-d894d151e1f4', '2026-08-11 21:50:38.953178+00', 'device', 'ТРЦ Хан-Шатыр — Фудкорт', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('85a523e1-40eb-4111-8284-57632a84be7c', '2026-08-18 22:35:35.179917+00', 'device', 'ТРЦ Хан-Шатыр — Парковка P1', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('f6ddb844-7fe3-4914-b4f5-e6c01c4da510', '2026-08-14 01:48:52.845115+00', 'device', 'ТРЦ Хан-Шатыр — Детская зона', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('bdc1ce80-22d4-49c8-bab0-2d151454ccfe', '2026-09-02 02:15:49.979436+00', 'stream', 'https://cameras.smarty.kz/rtplive/camera3.stream/playlist.m3u8', NULL, '6e95316d-732b-4c18-b9c3-2ddea969a1e1', NULL);
INSERT INTO public.objects VALUES ('0c23f1b5-c85c-49ee-9e19-a3380a09612f', '2026-09-02 02:15:49.979436+00', 'stream', 'https://cameras.smarty.kz/rtplive/camera2.stream/playlist.m3u8', NULL, '60e35f71-e404-4ab7-9e9c-4bba1bf9907a', NULL);
INSERT INTO public.objects VALUES ('c247a995-caea-4775-b7f3-d3b061cfecf3', '2026-09-02 02:15:49.979436+00', 'stream', 'https://cameras.smarty.kz/rtplive/camera4.stream/playlist.m3u8', NULL, '8b06bf05-03e4-4d43-9f3c-14a5e940859a', NULL);
INSERT INTO public.objects VALUES ('675257af-eafe-4495-adfa-86acbb5c58cb', '2026-09-04 05:28:14.675665+00', 'segment', 'ivideon://100-gXWBAIs5iYCCGE2UNDkqZz/327680', NULL, '11a1ad9f-81bd-4e24-91f8-8197132141b5', NULL);
INSERT INTO public.objects VALUES ('4f52a590-fa11-4007-b509-58dd4cc06451', '2026-09-04 08:34:30.559977+00', 'segment', 'ivideon://100-O49sV4p64NwZhD6mImjRhm/0', NULL, '15e7334d-e86e-4cea-9da2-5b7a2e3e0a85', NULL);
INSERT INTO public.objects VALUES ('94f531f9-0156-4c49-950e-f0425755d41b', '2026-09-05 00:51:31.50182+00', 'segment', 'ivideon://100-gXWBAIs5iYCCGE2UNDkqZz/327680', NULL, '11a1ad9f-81bd-4e24-91f8-8197132141b5', NULL);
INSERT INTO public.objects VALUES ('d6c5a480-8a5c-47a7-93b6-30b80fad65bd', '2026-09-05 00:52:45.084499+00', 'segment', 'ivideon://100-gXWBAIs5iYCCGE2UNDkqZz/327680', NULL, '11a1ad9f-81bd-4e24-91f8-8197132141b5', NULL);
INSERT INTO public.objects VALUES ('84581e6a-d84a-4db5-8609-0a9e2c5e67d0', '2026-09-05 04:11:39.16637+00', 'segment', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, '93a04268-ade1-4b91-bac0-6ef23652012f', NULL);
INSERT INTO public.objects VALUES ('8447b514-86af-4718-9a58-22b07c19b47c', '2026-09-05 00:53:13.664802+00', 'segment', 'ivideon://100-O49sV4p64NwZhD6mImjRhm/0', NULL, '15e7334d-e86e-4cea-9da2-5b7a2e3e0a85', NULL);
INSERT INTO public.objects VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-07 04:12:04.279719+00', 'group', 'all', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('aaaaaaaa-0000-0000-0000-000000000002', '2026-09-07 04:12:04.279719+00', 'group', 'ground-floor', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', NULL);
INSERT INTO public.objects VALUES ('aaaaaaaa-0000-0000-0000-000000000003', '2026-09-07 04:12:04.279719+00', 'group', 'archive', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', NULL);
INSERT INTO public.objects VALUES ('1678f6bf-b18d-4f2f-8a25-bfe117572da1', '2026-09-07 07:12:39.02471+00', 'segment', NULL, NULL, NULL, '11111111-1111-1111-1111-111111111111');
INSERT INTO public.objects VALUES ('a1000000-0000-0000-0000-000000000001', '2026-09-03 02:55:20.705921+00', 'stream', 'ivideon://100-Ud6bCsaaUqAkdBaDisGWup/0', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('a1000000-0000-0000-0000-000000000002', '2026-09-03 02:55:20.705921+00', 'stream', 'ivideon://100-gXWBAIs5iYCCGE2UNDkqZz/327680', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('a1000000-0000-0000-0000-000000000003', '2026-09-03 02:55:20.705921+00', 'stream', 'ivideon://100-O49sV4p64NwZhD6mImjRhm/0', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('a1000000-0000-0000-0000-000000000004', '2026-09-03 02:55:20.705921+00', 'stream', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('a1000000-0000-0000-0000-000000000005', '2026-09-03 02:55:20.705921+00', 'stream', 'ivideon://100-ab7814da858ba1b5c3f69982c42a855c/0', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('ffa1fb77-5466-4879-ae1d-2b628109dfd6', '2026-09-03 04:18:13.521162+00', 'process', 'ivideon://100-Ud6bCsaaUqAkdBaDisGWup/0', NULL, 'a1000000-0000-0000-0000-000000000001', NULL);
INSERT INTO public.objects VALUES ('11a1ad9f-81bd-4e24-91f8-8197132141b5', '2026-09-04 05:27:17.347455+00', 'process', 'ivideon://100-gXWBAIs5iYCCGE2UNDkqZz/327680', NULL, 'a1000000-0000-0000-0000-000000000002', NULL);
INSERT INTO public.objects VALUES ('15e7334d-e86e-4cea-9da2-5b7a2e3e0a85', '2026-09-04 08:34:25.022752+00', 'process', 'ivideon://100-O49sV4p64NwZhD6mImjRhm/0', NULL, 'a1000000-0000-0000-0000-000000000003', NULL);
INSERT INTO public.objects VALUES ('f5f94945-82ad-471e-aaf8-64c40b238c80', '2026-09-05 00:56:08.018343+00', 'process', 'ivideon://100-ab7814da858ba1b5c3f69982c42a855c/0', NULL, 'a1000000-0000-0000-0000-000000000005', NULL);
INSERT INTO public.objects VALUES ('93a04268-ade1-4b91-bac0-6ef23652012f', '2026-09-05 04:11:39.098006+00', 'process', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, 'a1000000-0000-0000-0000-000000000004', NULL);
INSERT INTO public.objects VALUES ('3ade4ba7-0964-4b57-aedd-f63008d89950', '2026-09-05 07:00:15.435504+00', 'segment', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, '93a04268-ade1-4b91-bac0-6ef23652012f', NULL);
INSERT INTO public.objects VALUES ('2970b591-66df-4c7e-ad8a-b1070a08a68e', '2026-09-05 07:01:04.330188+00', 'segment', 'ivideon://100-Ud6bCsaaUqAkdBaDisGWup/0', NULL, 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('169b2c1f-0e3a-43eb-ad67-99da950fa7d1', '2026-09-05 07:00:53.64499+00', 'segment', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, '93a04268-ade1-4b91-bac0-6ef23652012f', NULL);
INSERT INTO public.objects VALUES ('e5d57742-a5b5-4ffb-bb37-a9fccc49dd36', '2026-09-05 04:30:02.307075+00', 'segment', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, '93a04268-ade1-4b91-bac0-6ef23652012f', NULL);
INSERT INTO public.objects VALUES ('66f183c9-8755-4c48-8f47-ffd4ec7fb7d1', '2026-09-05 07:51:50.856249+00', 'segment', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, '93a04268-ade1-4b91-bac0-6ef23652012f', NULL);
INSERT INTO public.objects VALUES ('ae6d3358-a2d1-4bfe-935a-182e191107a3', '2026-09-05 08:58:58.499171+00', 'segment', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, '93a04268-ade1-4b91-bac0-6ef23652012f', NULL);
INSERT INTO public.objects VALUES ('044ea9ef-db4f-4238-b1e8-9e10250c07a6', '2026-09-05 09:09:18.708842+00', 'segment', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, '93a04268-ade1-4b91-bac0-6ef23652012f', NULL);
INSERT INTO public.objects VALUES ('a2571d3b-530d-41ad-a8eb-027576a7d35c', '2026-09-05 09:30:48.203713+00', 'segment', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, '93a04268-ade1-4b91-bac0-6ef23652012f', NULL);
INSERT INTO public.objects VALUES ('c1ca264a-2e61-4e58-8aab-8cf857534bbb', '2026-09-05 09:43:25.036708+00', 'segment', 'ivideon://100-3CPXm1fxzNgCzT01gyh41y/0', NULL, '93a04268-ade1-4b91-bac0-6ef23652012f', NULL);
INSERT INTO public.objects VALUES ('1a430da6-329d-4874-adcd-960a505e1f0b', '2026-09-06 05:29:04.167596+00', 'segment', 'ivideon://100-O49sV4p64NwZhD6mImjRhm/0', NULL, '15e7334d-e86e-4cea-9da2-5b7a2e3e0a85', NULL);
INSERT INTO public.objects VALUES ('3df2093d-1740-4260-a1d8-f9908ce07fb5', '2026-09-04 01:43:40.625789+00', 'segment', 'ivideon://100-Ud6bCsaaUqAkdBaDisGWup/0', NULL, 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('2033c915-0ac7-4d24-9d40-ab0410ed6886', '2026-09-04 01:45:23.158776+00', 'segment', 'ivideon://100-Ud6bCsaaUqAkdBaDisGWup/0', NULL, 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('53318369-0418-4940-801e-2aa44364bbf5', '2026-09-04 05:27:17.38643+00', 'segment', 'ivideon://100-gXWBAIs5iYCCGE2UNDkqZz/327680', NULL, '11a1ad9f-81bd-4e24-91f8-8197132141b5', NULL);
INSERT INTO public.objects VALUES ('c33973df-77ea-4cae-ab60-291812284af3', '2026-08-14 22:53:14.298945+00', 'device', 'ТРЦ Хан-Шатыр — Торговый зал A', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('ceca4acd-a698-4053-afe3-d0c9d9fcfcf3', '2026-08-27 23:35:04.137301+00', 'device', 'ТРЦ Хан-Шатыр — Торговый зал B', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('a94320b2-28d8-4500-9aa7-83dceb6abb56', '2026-08-10 02:27:46.834601+00', 'device', 'ТРЦ Хан-Шатыр — Кинотеатр', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('e6480fb5-f6da-4d29-af78-8e4f04fca886', '2026-08-28 10:35:58.106395+00', 'device', 'ТРЦ Хан-Шатыр — Аварийный выход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('1ef39b3e-97c0-456a-b303-4cc7180b8113', '2026-08-30 03:33:30.559099+00', 'device', 'ТРЦ Хан-Шатыр — Камера хранения', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('60e35f71-e404-4ab7-9e9c-4bba1bf9907a', '2026-08-27 06:26:30.415385+00', 'device', 'ТРЦ Мега — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('0fcd53d4-456e-45fc-a484-dd9f83ece51a', '2026-08-08 02:53:44.541697+00', 'device', 'ТРЦ Мега — Супермаркет', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('6e53e1e6-a518-4aef-8fb1-757e8d4dc25e', '2026-08-06 07:40:28.431713+00', 'device', 'ТРЦ Мега — Одежда', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('385562d8-ee9a-4ba5-9f8e-c2bf843265e1', '2026-09-03 08:45:55.731638+00', 'incident', 'Подозрительный объект', 'Замечен человек у витрины', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('7631df4f-12d5-41b8-9b64-60d43117b3f0', '2026-09-04 02:17:13.893494+00', 'incident', 'фыв', 'фыв', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('433e87a7-3ceb-44b0-8f5b-99c97afca28b', '2026-09-04 02:17:19.892619+00', 'incident', 'фывфвфва', 'фывфыв', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('f144d439-fde6-4332-b57f-71890d86f396', '2026-09-04 02:17:28.981526+00', 'incident', 'фывфывфыва', 'фыафыа', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('fe2f7a24-f7ef-4d51-bd81-bf1f08aa757d', '2026-09-04 02:17:34.32608+00', 'incident', 'фыафыа', 'фыафа', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('c46a9c0e-b151-486e-8d6b-0afb6a42cc23', '2026-09-04 02:17:42.047278+00', 'incident', 'фыапафыаф', 'фыафыафыа', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('895952e2-3ec4-4fcc-b8bd-606ae76245c0', '2026-09-04 02:17:45.631018+00', 'incident', 'фыафыа', 'фыафа', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('e4b11584-6a01-4b4d-a155-223efbbd237a', '2026-09-04 02:17:56.302244+00', 'incident', 'фывфвфв', 'фыв', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('d1d701b4-9266-48be-9807-350744c33a59', '2026-09-04 02:21:20.685271+00', 'incident', 'фыфаф', 'фафа', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('17e0b7f5-7053-4186-8899-30ca184ed90c', '2026-08-30 23:14:02.363955+00', 'device', 'ТРЦ Мега — Электроника', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('cfcfa95a-2500-46b6-bfc6-7ea5c48cbce6', '2026-08-17 02:34:41.494747+00', 'device', 'ТРЦ Мега — Парковка крытая', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('bc9fa4e6-f75f-4676-865d-bb2019283a79', '2026-08-07 06:33:06.172384+00', 'device', 'ТРЦ Мега — Детский мир', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('7e7d4328-8bf8-4f48-b8d7-80caafb1576e', '2026-08-22 14:48:32.958108+00', 'device', 'ТРЦ Мега — Фудкорт', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('455c17d0-9b25-48a7-806b-1b32ad8e8e0e', '2026-08-26 06:18:49.354083+00', 'device', 'ТРЦ Мега — Кассовая зона', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('84c58030-64e0-43dc-861d-2c2a9a666cf6', '2026-08-27 21:09:17.276753+00', 'device', 'ТРЦ Мега — Туалетная зона', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('b717883a-19bb-4938-abde-3af6210be65d', '2026-08-23 10:16:12.44865+00', 'device', 'ТРЦ Мега — Склад', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('fc805d3e-9fe4-45e4-9d60-9aca845ab7dc', '2026-08-04 02:39:13.006728+00', 'device', 'Метро Кеш — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('74e7e3cf-e1a7-4eb7-88da-be453969d9c5', '2026-08-12 20:53:55.323713+00', 'device', 'Метро Кеш — Товары для дома', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('62544702-ec3d-4b19-85fd-c1fa9e1a0cbb', '2026-08-07 17:48:07.222667+00', 'device', 'Метро Кеш — Продукты', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('8e979829-ebb4-42eb-befd-d10da60d9e0d', '2026-08-11 05:37:22.760852+00', 'device', 'Метро Кеш — Мясной отдел', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('f2977eaf-1abc-4f02-84fc-868b7307dc5d', '2026-08-31 10:44:47.081613+00', 'device', 'Метро Кеш — Овощной отдел', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('807e1cee-5bf1-4df8-bc38-879639711a77', '2026-08-12 23:54:00.922767+00', 'device', 'Метро Кеш — Хлебный', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('a3bf66d8-559f-46d4-933f-d44bcf173e06', '2026-08-23 07:38:44.363921+00', 'device', 'Метро Кеш — Кассы', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('aad3ab05-3afe-4c7e-a12e-e1c58eae0b06', '2026-08-13 01:04:55.233737+00', 'device', 'Метро Кеш — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('73ab7da2-4170-4ce3-9d72-bc2df9151cdd', '2026-08-31 16:01:22.418458+00', 'device', 'Метро Кеш — Склад', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('7e0ecea0-c4e9-4827-895b-ce766a3a8c30', '2026-08-28 16:15:35.105516+00', 'device', 'Метро Кеш — Камера контроля', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('b10000a7-4e15-43af-8f1b-4552cc18622c', '2026-08-29 16:29:01.953968+00', 'device', 'ГУМ — Главный зал', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('2a797000-ba29-4079-b4ed-9b12f76592d7', '2026-08-15 01:45:19.873954+00', 'device', 'ГУМ — Цокольный этаж', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('9fb62e65-2366-4d24-bdb1-7e88a86125f7', '2026-08-07 04:47:57.15952+00', 'device', 'ГУМ — Второй этаж', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('68ac504e-aa47-45d4-92c7-633c82949178', '2026-08-05 20:37:34.922003+00', 'device', 'ГУМ — Третий этаж', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('e4c5a31c-39e1-48d8-8109-f86d6c5da2a9', '2026-08-15 15:42:36.822105+00', 'device', 'ГУМ — Летний сад', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('1c65a701-59cb-43ce-993c-2d0351c284de', '2026-08-20 17:01:28.624888+00', 'device', 'ГУМ — Фудкорт', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('9c4a1138-4b76-41e7-91ed-269d622a1d7b', '2026-08-06 09:27:01.546385+00', 'device', 'ГУМ — Вход Кутузовский', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('d6925408-c733-4f0d-be40-e493d9bb0148', '2026-08-06 14:37:02.649922+00', 'device', 'ГУМ — Вход Моховая', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('43ca10ff-87f8-473e-b0b4-f4bc0f3133f7', '2026-08-21 03:14:51.855698+00', 'device', 'ГУМ — Эскалаторы', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('99ae4a58-ee43-4e87-a012-da7900f537f1', '2026-08-15 13:52:50.911092+00', 'device', 'ГУМ — Камера наблюдения', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('6e95316d-732b-4c18-b9c3-2ddea969a1e1', '2026-08-13 04:49:58.448939+00', 'device', 'Авиапарк — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('61b233a3-5c75-415b-81d2-3cc6744542f1', '2026-08-07 05:51:10.481001+00', 'device', 'Авиапарк — Торговый зал 1', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('f6c69419-1260-4197-b680-6f5ac050fd7c', '2026-08-08 07:25:59.842681+00', 'device', 'Авиапарк — Торговый зал 2', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('28627b10-1267-49b4-8669-f9012ee04273', '2026-08-31 19:56:05.173959+00', 'device', 'Авиапарк — Кинотеатр', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('f8618e87-dd53-466b-9e3c-792c4d058827', '2026-08-15 06:42:14.072638+00', 'device', 'Авиапарк — Аквариум', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('c08443ab-419f-4f66-864a-578368202597', '2026-08-09 13:50:56.479315+00', 'device', 'Авиапарк — Фудкорт', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('55d6757d-1fb1-411a-aeee-6735dbbf8be7', '2026-08-28 17:56:26.896248+00', 'device', 'Авиапарк — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('9de3a594-4e99-46c5-ad1b-42c146160361', '2026-08-07 11:55:09.193047+00', 'device', 'Авиапарк — Детская зона', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('f8c2c8a7-84f0-4d5d-97c9-49bdcae335e6', '2026-08-24 11:04:51.321117+00', 'device', 'Авиапарк — Спортзал', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('6380d590-0037-4a45-8b4c-c11e11ab9502', '2026-08-07 23:56:51.062139+00', 'device', 'Авиапарк — Выход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('8b06bf05-03e4-4d43-9f3c-14a5e940859a', '2026-08-15 16:53:18.798622+00', 'device', 'Европейский — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('c6c10c17-ee3f-45b9-8e45-2f038e5dfa18', '2026-08-20 14:49:19.494908+00', 'device', 'Европейский — Галерея', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('135b2587-57f3-44e7-a911-9f702b7f9eed', '2026-08-03 21:37:46.013923+00', 'device', 'Европейский — Бутики', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('841f7366-89c5-47ab-ab56-ad51d5068248', '2026-08-18 18:03:39.448045+00', 'device', 'Европейский — Кафе', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('e814d42e-77b3-4cb0-ba49-eb6c0f0b2426', '2026-08-11 06:13:08.337121+00', 'device', 'Европейский — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('a166a054-cf1a-4753-8bea-91c92d9bd859', '2026-08-14 00:45:08.861709+00', 'device', 'Европейский — Кинотеатр', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('64eb0629-160e-443a-8d4d-e7fe4c58f26f', '2026-08-05 10:08:33.259103+00', 'device', 'Европейский — Эскалатор', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('9f1893de-25f3-4d5d-9b39-60bb1cca932d', '2026-08-20 00:58:54.968158+00', 'device', 'Европейский — Касса', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('db564f09-208d-4779-8e67-09e9f7eceb1b', '2026-08-24 01:59:06.821705+00', 'device', 'Европейский — Склад', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('60e934b3-4794-43f5-82fb-27a85feb2bc5', '2026-08-29 21:17:51.228943+00', 'device', 'Европейский — Зона отдыха', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('a79dfc3f-c81a-4ae5-ba98-6d71806389e3', '2026-08-06 00:31:27.610487+00', 'device', 'Москва Сити — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('e5d3ee34-fb46-481b-947c-766ce55afad1', '2026-08-14 07:31:47.963859+00', 'device', 'Москва Сити — Торговый зал', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('954a596c-9ad6-471a-b4a5-8840b296c962', '2026-08-24 06:25:36.61558+00', 'device', 'Москва Сити — Башня', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('46db2805-b505-4a71-9b82-644daa0a144b', '2026-08-16 07:00:53.687424+00', 'device', 'Москва Сити — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('8de07ebb-0684-42d0-aea7-786cb6f0a8ae', '2026-08-25 21:57:37.756712+00', 'device', 'Москва Сити — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('05da32c2-3c2f-4faa-8767-c809a63ab04a', '2026-08-28 06:20:28.393852+00', 'device', 'Кунцево Плаза — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('bd0ce819-ac2c-463a-b5f3-ea19b4006cfe', '2026-08-31 14:15:22.392783+00', 'device', 'Кунцево Плаза — Магазин', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('824d2a79-3833-4a3d-9aa0-83b29acbcad7', '2026-08-11 22:34:49.848953+00', 'device', 'Кунцево Плаза — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('3842bf63-96b4-44e7-9deb-4d8756349f55', '2026-08-03 18:29:43.589204+00', 'device', 'Кунцево Плаза — Склад', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('132ae113-96b9-4b4d-908b-292be749f7a1', '2026-08-30 22:42:12.229634+00', 'device', 'Кунцево Плаза — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('a1fd65d8-df0b-4477-a130-a87837604f86', '2026-08-22 05:21:17.009192+00', 'device', 'Ривьера — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('20d50a11-92db-4c43-81bc-1f5c978eb7a7', '2026-08-19 11:31:08.135465+00', 'device', 'Ривьера — Торговый зал', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('8c91aa03-b3b0-4204-a273-bec683c8cd8d', '2026-08-19 05:15:43.497182+00', 'device', 'Ривьера — Фудкорт', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('e0138779-7851-4e76-9824-ec860f0662f1', '2026-08-13 00:31:18.917187+00', 'device', 'Ривьера — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('6ff0b19b-8354-40d7-b802-112b54e9fbfc', '2026-09-01 01:13:51.262681+00', 'device', 'Ривьера — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('bd10698a-2cac-421e-8f03-0e9d211c67ba', '2026-08-24 16:34:03.681998+00', 'device', 'Капитолий — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('323c6a1f-ee91-49fd-a5c8-0d17d00beb7c', '2026-08-31 20:13:32.296002+00', 'device', 'Капитолий — Магазин одежды', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('d8cfc981-b37c-4a5c-9b57-999f0c55ffca', '2026-08-04 21:16:40.376158+00', 'device', 'Капитолий — Электроника', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('0d1f38de-0a3f-465c-8c2c-3c344ea5fddc', '2026-08-25 00:04:55.907713+00', 'device', 'Капитолий — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('45298d25-2d1e-423e-8dae-c34e1a6a7afb', '2026-08-12 08:20:28.438139+00', 'device', 'Капитолий — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('4c41196b-90a5-4b13-b276-e70a99776134', '2026-08-21 19:36:53.799113+00', 'device', 'WESTfield — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('4acaa933-86f0-4a1c-9e73-4f560ebc612e', '2026-08-29 22:32:15.01483+00', 'device', 'WESTfield — Галерея', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('2a5ee39c-38f5-4c3a-9795-12a57206ad15', '2026-08-20 12:24:06.996858+00', 'device', 'WESTfield — Бутики', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('78d6bd24-7360-4f86-a7bf-05569cc9c6e3', '2026-08-06 09:35:11.599502+00', 'device', 'WESTfield — Фудкорт', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('ec8c6b35-c1b4-4a10-9b48-7b0d955588e1', '2026-08-11 22:26:13.458481+00', 'device', 'WESTfield — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('20e7abfa-c1d9-4770-b9b3-125c06018056', '2026-08-15 20:06:11.248199+00', 'device', 'WESTfield — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('2240def5-4506-460e-a19e-2208ecae1ba4', '2026-08-16 02:14:36.458203+00', 'device', 'Остров — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('ddfba29a-1b8d-44f2-9d88-302eb31082df', '2026-08-28 09:52:12.765349+00', 'device', 'Остров — Торговый зал', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('f6aef641-88e5-4bfb-ad81-a0bd8f048e90', '2026-08-04 01:58:04.149075+00', 'device', 'Остров — Рестораны', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('7859b802-13b3-4433-a434-90ab42a59b20', '2026-08-19 14:55:45.918769+00', 'device', 'Остров — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('bb088f01-85cf-4631-a06d-d43ccb0146b3', '2026-08-14 18:42:53.81539+00', 'device', 'Остров — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('db2162ff-0d85-4cde-a197-92fd206ebbc1', '2026-08-28 00:55:02.334873+00', 'device', 'Nautilus — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('ea8d739d-34c3-4b4e-8f54-87759ec33ce4', '2026-08-06 09:22:48.002672+00', 'device', 'Nautilus — Магазин', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('b1b3677e-bd7c-4f94-9c81-42041f361c7d', '2026-08-23 19:38:32.208553+00', 'device', 'Nautilus — Кафе', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('902dc56c-b1cf-4126-a950-9f5c93f5a28c', '2026-08-29 03:58:57.527534+00', 'device', 'Nautilus — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('3ccdb24d-bca8-47ca-a25b-177d60179f5c', '2026-08-09 21:01:48.386269+00', 'device', 'Nautilus — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('7cd2cfa2-441d-4e4c-b0a3-25e7edc01093', '2026-08-03 17:29:50.081286+00', 'device', 'ФЕСТ — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('31daede8-6f6d-4e50-8ffa-172ff6bfd4ad', '2026-08-05 03:49:24.796775+00', 'device', 'ФЕСТ — Супермаркет', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('c4ab1f08-a573-48f6-b726-bf915091e95f', '2026-08-18 19:57:02.239264+00', 'device', 'ФЕСТ — Одежда', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('5cde921f-4cde-4ddc-b93c-8d7269888c68', '2026-08-25 17:31:43.38962+00', 'device', 'ФЕСТ — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('7e15f552-4855-411d-9d15-b41ecb790fd9', '2026-08-16 15:46:55.895978+00', 'device', 'ФЕСТ — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('267ea368-ae47-46a0-904c-34573defe5d7', '2026-08-24 18:36:07.658825+00', 'device', 'Нева — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('7beb5b15-fe97-46b8-927c-77d3f690bcae', '2026-08-10 16:01:10.096461+00', 'device', 'Нева — Торговый зал', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('5c9778f3-bada-4126-9929-c364f516d57e', '2026-09-01 04:59:22.619033+00', 'device', 'Нева — Ресторан', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('0c3edb77-7d28-48e5-b46b-ffee966434ba', '2026-08-10 18:35:00.977504+00', 'device', 'Нева — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('e41a0845-450c-4d67-b594-41c239ff4fd8', '2026-08-18 10:46:57.502514+00', 'device', 'Нева — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('45bbcdb1-5202-409b-8978-063367035fb5', '2026-08-12 15:15:26.879382+00', 'device', 'Кара — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('46545224-af42-4d51-80b2-55c327a6670a', '2026-08-09 07:35:52.434069+00', 'device', 'Кара — Зал', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('51648373-572d-4d93-8969-3e8952eb3ae9', '2026-08-24 10:40:42.771778+00', 'device', 'Кара — Склад', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('3f957347-e690-4f5d-99e6-7387db5cb8c3', '2026-08-10 18:48:46.276892+00', 'device', 'Кара — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('9c0d29f1-b48c-4988-8428-fb3dcaa17e41', '2026-08-14 08:21:42.621599+00', 'device', 'Кара — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('b33f3b9f-f5d5-4310-8b9c-aa8d29aa1657', '2026-08-27 20:42:26.190469+00', 'device', 'Квартал — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('ca46f0f5-4df0-460c-96d7-957432acecce', '2026-08-06 05:50:53.134274+00', 'device', 'Квартал — Кафе', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('f7999d59-ee88-4024-99aa-8009e50fa164', '2026-08-07 02:44:52.064956+00', 'device', 'Квартал — Парковка', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('d58d659f-0f70-4b3e-807a-3ee4d2baaf63', '2026-08-07 08:25:34.020791+00', 'device', 'Квартал — Камера', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('08a162e1-5c9b-4593-8204-f4362273e6a6', '2026-08-25 11:35:58.58002+00', 'device', 'Вольго-Град — Вход', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('68df97ce-84d8-45a5-ada9-bae6f9d5992c', '2026-08-20 11:28:09.810828+00', 'device', 'Вольго-Град — Магазин', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('3906fde0-e3fa-4e9a-b561-5edc5a74ed67', '2026-08-08 20:23:46.750502+00', 'device', 'Вольго-Град — Склад', NULL, NULL, NULL);
INSERT INTO public.objects VALUES ('aebcf78d-3358-4a79-b48f-20168350bf11', '2026-09-04 02:21:30.103915+00', 'incident', 'фыафыафа', 'фыафафафа', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('a3ca520a-7b38-4552-931d-fe3d3694f26b', '2026-09-04 02:26:52.378262+00', 'incident', 'asdasf', 'afafaf', 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('54b037ad-0573-419a-bfcf-81d81f84c89b', '2026-09-04 02:26:58.419071+00', 'incident', 'aafafafafafg', NULL, 'ffa1fb77-5466-4879-ae1d-2b628109dfd6', NULL);
INSERT INTO public.objects VALUES ('dbe187b0-f0d8-4c10-9604-7ef60927d012', '2026-09-04 08:33:04.391055+00', 'incident', 'фывфв', NULL, '11a1ad9f-81bd-4e24-91f8-8197132141b5', NULL);
INSERT INTO public.objects VALUES ('9d009e01-d349-4f84-8b31-b47fd511cd0d', '2026-09-01 05:45:54.046231+00', 'device', 'Вольго-Град — Парковка', NULL, NULL, NULL);


ALTER TABLE public.objects ENABLE TRIGGER ALL;

--
-- Data for Name: group_members; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.group_members DISABLE TRIGGER ALL;



ALTER TABLE public.group_members ENABLE TRIGGER ALL;

--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.roles DISABLE TRIGGER ALL;

INSERT INTO public.roles VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'admin', '2026-08-31 10:58:38.815788+00');
INSERT INTO public.roles VALUES ('014641df-a049-4948-9c40-6179a9837b36', 'operator', '2026-08-31 10:58:38.815788+00');
INSERT INTO public.roles VALUES ('82b54abf-3bdb-40bd-88b7-570935f9d5a5', 'editor', '2026-09-06 12:24:52.571338+00');
INSERT INTO public.roles VALUES ('9f901d9a-43a6-4262-a27b-858645d68081', 'viewer', '2026-08-31 10:58:38.815788+00');


ALTER TABLE public.roles ENABLE TRIGGER ALL;

--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.permissions DISABLE TRIGGER ALL;

INSERT INTO public.permissions VALUES ('9963ba3b-0861-40aa-9cc6-1ef16d70c666', 'f4fdd515-c8f1-4965-8a67-b883fbee6022', 'aaaaaaaa-0000-0000-0000-000000000001', 'read');
INSERT INTO public.permissions VALUES ('4e162f77-0986-488f-bb51-5c67f6148bd8', 'f4fdd515-c8f1-4965-8a67-b883fbee6022', 'aaaaaaaa-0000-0000-0000-000000000001', 'write');
INSERT INTO public.permissions VALUES ('9e815a63-8b3d-40dc-ab58-0297ec500f13', 'f4fdd515-c8f1-4965-8a67-b883fbee6022', 'aaaaaaaa-0000-0000-0000-000000000001', 'delete');
INSERT INTO public.permissions VALUES ('448eb876-48d6-47ba-a8f7-320c0267c3dd', '014641df-a049-4948-9c40-6179a9837b36', 'aaaaaaaa-0000-0000-0000-000000000002', 'read');
INSERT INTO public.permissions VALUES ('d2684033-6731-43af-a40c-76e26e59688b', '82b54abf-3bdb-40bd-88b7-570935f9d5a5', 'aaaaaaaa-0000-0000-0000-000000000001', 'delete');
INSERT INTO public.permissions VALUES ('aff186a8-ea6e-4446-b6d3-285fc6cc99d4', '82b54abf-3bdb-40bd-88b7-570935f9d5a5', 'aaaaaaaa-0000-0000-0000-000000000001', 'read');
INSERT INTO public.permissions VALUES ('8d4016ca-624c-4f56-af85-fdd7b1fb1ecd', '82b54abf-3bdb-40bd-88b7-570935f9d5a5', 'aaaaaaaa-0000-0000-0000-000000000001', 'write');


ALTER TABLE public.permissions ENABLE TRIGGER ALL;

--
-- Data for Name: role_capabilities; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.role_capabilities DISABLE TRIGGER ALL;

INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'admin:read', '2026-09-06 16:21:31.144136+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'admin:write', '2026-09-06 16:21:31.144136+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'user:create', '2026-09-06 16:21:31.144136+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'user:read', '2026-09-06 16:21:31.144136+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'user:update', '2026-09-06 16:21:31.144136+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'user:delete', '2026-09-06 16:21:31.144136+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'audit:delete', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'audit:read', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'camera:create', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'chunk:create', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'group:create', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'group:delete', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'group:read', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'group:update', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'media:export', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'permission:manage', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'permission:read', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'process:create', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'role:create', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'role:delete', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'role:read', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'role:update', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'stream:create', '2026-09-06 16:40:45.529689+00');
INSERT INTO public.role_capabilities VALUES ('f4fdd515-c8f1-4965-8a67-b883fbee6022', 'user:password:reset', '2026-09-06 16:40:45.529689+00');


ALTER TABLE public.role_capabilities ENABLE TRIGGER ALL;

--
-- Data for Name: role_object_grants; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.role_object_grants DISABLE TRIGGER ALL;



ALTER TABLE public.role_object_grants ENABLE TRIGGER ALL;

--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.user_roles DISABLE TRIGGER ALL;

INSERT INTO public.user_roles VALUES ('11111111-1111-1111-1111-111111111111', 'f4fdd515-c8f1-4965-8a67-b883fbee6022');
INSERT INTO public.user_roles VALUES ('22222222-2222-2222-2222-222222222222', '014641df-a049-4948-9c40-6179a9837b36');


ALTER TABLE public.user_roles ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict RsTgtifYdoXO6D3ayPQfr1JjugFg9zmCNXToabY3SqQy0aQxLfbDalzhZ32vGy4

