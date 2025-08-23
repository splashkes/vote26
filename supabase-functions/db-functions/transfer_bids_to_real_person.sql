                                                   pg_get_functiondef                                                   
------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.transfer_bids_to_real_person()                                                      +
  RETURNS TABLE(old_person_id uuid, new_person_id uuid, bids_moved integer, votes_moved integer)                       +
  LANGUAGE plpgsql                                                                                                     +
 AS $function$                                                                                                         +
 DECLARE                                                                                                               +
   -- Mapping from the fix function output                                                                             +
   person_mapping RECORD;                                                                                              +
   bid_count INTEGER;                                                                                                  +
   vote_count INTEGER;                                                                                                 +
 BEGIN                                                                                                                 +
   -- Based on the fix_circular_person_links results, transfer data                                                    +
   FOR person_mapping IN VALUES                                                                                        +
     ('652d86dc-dbd7-4d0f-a77c-24cd665f5157'::uuid, '8b51df7b-06ce-4572-8d5e-85dab2e73c20'::uuid), -- Celia Hawk       +
     ('38d644cc-b952-4e8b-9083-9eb4b1f6f6da'::uuid, 'bf2f75d0-e8d9-496a-85be-5a317d8e150c'::uuid), -- Kristin Murray   +
     ('a0566655-a7ef-4b77-93c8-b187e635f01e'::uuid, 'db4bf17b-1a41-448c-bbfb-8959ea22bd4d'::uuid), -- Jeremiah Hahn    +
     ('92834fee-0a3b-4694-9d8d-dd83980ccd23'::uuid, '2b84b483-d15c-4f16-9f29-b6664c691b6a'::uuid), -- James Woods      +
     ('230aea7e-67c5-4b42-bd5f-1267a5077ce5'::uuid, 'b133be13-8312-4d0b-a99e-8adeb1975eb2'::uuid), -- Tina Traughber   +
     ('4850fed0-7b8e-470d-b297-a2b5fc497756'::uuid, 'db22c1b5-3a43-4e5b-9163-688696d3f6b8'::uuid), -- Bob Wright       +
     ('f3356b6f-7cef-47c0-9012-fdf2ef167ebe'::uuid, '7a658780-60ee-46c7-8115-126dbab31eda'::uuid), -- Celina Wright    +
     ('3991bb6e-ee8f-4482-9de9-cf075508fc05'::uuid, '71a679e7-b739-42dd-8de2-abc5f4747dcb'::uuid), -- Brandi Cline     +
     ('89c10ac8-fe0c-426e-a72d-fec608193f57'::uuid, '98fa7a98-e522-40ad-b3c9-1a3625099c94'::uuid), -- Donald Webb      +
     ('2d70a2b8-3b33-4979-b38c-dd75c14ad768'::uuid, '524a5307-4685-4e11-aecd-12491d62a693'::uuid), -- Julie Stephenson +
     ('136d285c-339b-45e2-93ce-271b7a09ee78'::uuid, 'b3d717c5-8bf4-474d-aea2-99412567dc62'::uuid), -- Zach Warden      +
     ('180f5678-600a-4337-8b35-6869fe8e6f95'::uuid, 'fd6bcb28-1786-4ff9-b903-0570e6078d75'::uuid), -- Cait Schramm     +
     ('15950df5-4781-45b6-8e24-4a113ee25a2c'::uuid, '53dfd799-e941-4cb7-8eca-0fb8a7b5a65e'::uuid), -- Daniel J         +
     ('6ce6fc8b-af64-444a-9dc2-1271a530d6d3'::uuid, '581c7072-2048-4bfc-a753-e6c6ab2128d3'::uuid), -- Stephanie Scheffe+
     ('4ed3a8b8-f4cf-4aa7-8cf2-f4f274f921fa'::uuid, '48b3d6e1-1557-40cd-8217-8446f0ce0daf'::uuid), -- Cathy Zecha      +
     ('daf8856b-1acf-468f-b781-a78bdde9fd67'::uuid, '698bd2c7-4d83-4570-9a6f-ebbef9dfbbd0'::uuid), -- Deniz sulek      +
     ('7c2d61ac-bb32-4c6d-bd57-14ffa73ff2b2'::uuid, '3432cc8e-76c4-4f1e-b959-5bc143f8f99e'::uuid), -- Sarah            +
     ('92aa5837-9a47-42fa-aad5-787b46acd48c'::uuid, 'd9b047d0-3cfd-44e7-a597-ad1f7facd56d'::uuid), -- Kinsee Aspinwall +
     ('e8eeade4-353a-4194-beb3-8bb6966739e9'::uuid, '5f36288c-75eb-44c1-bb24-c32c5ec298b7'::uuid), -- Megan McDermott  +
     ('cd91f93c-c170-4350-b0bc-29a4cc4a805c'::uuid, '82c30d87-0b05-4275-82f2-1ba6a3e7b34c'::uuid), -- David Granado    +
     ('27194409-6a5d-48d8-a4d4-22e589fbe0c6'::uuid, '2a4840ac-6208-417d-9849-12c830ff3372'::uuid), -- Virgil Mistler   +
     ('242aa0eb-3bae-4921-8327-8f4f3810860d'::uuid, 'd1e05795-daad-410e-bea9-61a38a6c856b'::uuid), -- Keila Fawcett    +
     ('1acc41fe-96fe-426b-a94f-073ab445111c'::uuid, '1b1dfa43-d0fc-4722-a849-ac8362034b51'::uuid), -- Leigha Madden    +
     ('b42fb839-5bfb-4f7a-9129-ac915dd266ee'::uuid, 'ce4a5f55-dd12-44d9-af15-8f83a510b0e7'::uuid), -- Guest            +
     ('54e1cfc9-e8d7-4362-9716-8c32b1d660ba'::uuid, '712935b0-8b25-4315-89ca-0e891e29f727'::uuid), -- Carl Martin      +
     ('4e68c9f7-3707-4e1a-9ed4-d84563728dd8'::uuid, '9b19214a-be9f-4a29-b773-f16bdbb675e3'::uuid), -- Michelle Smiddy  +
     ('0a3cb9ec-c443-4904-9c88-05ecef16072b'::uuid, '4109f976-41a3-4a5f-b3c3-49611d3bde74'::uuid), -- Guest            +
     ('e69b3a09-ce60-44cc-970e-1d6e953c63c9'::uuid, '59ebe3d8-d9c9-479e-9411-951d2b6973e2'::uuid), -- Jack Cline       +
     ('be00bb31-096b-4f95-9dea-cccfa7aff1ef'::uuid, '9250390f-a99b-45ba-85a7-a29cf5dc75dd'::uuid), -- Buck Skin        +
     ('2e62391e-adbc-4e99-b050-bd9ae93c2ad6'::uuid, 'd6cefe9d-cffd-4808-9396-eb270fb979cc'::uuid), -- Cassia Granado   +
     ('24d5dbb8-1950-4d54-8bbf-d0856ed7b868'::uuid, 'ea09aa7e-54bf-4bd2-a268-76ce2156df29'::uuid), -- Teiah Graham     +
     ('8d8496ea-1d6d-4ded-87ae-49a1eb61b5a6'::uuid, '75a2ae7a-4182-439b-9636-5357bbffbf9d'::uuid), -- Julie Sobczak    +
     ('68b9aec1-8582-4441-b802-ee69f0f72b72'::uuid, 'bd5c619b-634e-46f1-ae05-19755e55a6a9'::uuid), -- Melissa Williams +
     ('c4936356-577c-421f-b510-e559b09bd32c'::uuid, '132f6ea5-22f4-4ed2-9cc2-c685aad79a85'::uuid), -- Debbie Barrow    +
     ('fc6f0c38-5e88-4cdc-b7a7-a18a13d99dc3'::uuid, '0652ed06-082a-4553-aa5a-5f558ac9d2ad'::uuid), -- Gloria krahmer   +
     ('c11eaac1-c8cd-48ec-a35d-65ad61acc98d'::uuid, 'ca0c4eb9-0c51-4caa-a365-030df3239bf7'::uuid), -- Blaze Williams   +
     ('aa0e387f-4d57-48ac-9c0d-59a3553fd0bd'::uuid, '145680c3-6695-4a78-bbb6-4bf599cd300f'::uuid), -- Bob Barrow       +
     ('079da736-7703-4a5c-9a24-efe43daeca63'::uuid, '3e705f10-8387-48f6-a46e-c7902d1a57f2'::uuid), -- Karla ward       +
     ('a2c545c1-f4ca-40a4-8f0a-632458443123'::uuid, 'b3f0953f-7feb-4350-952d-87c076c52346'::uuid), -- Patricia Scheffe +
     ('518cb4e2-63a4-4034-bacd-982e16941425'::uuid, '37aa9957-bccc-4020-9efe-7474648df285'::uuid), -- Lelani Gibbs     +
     ('569f0c14-33b4-4ea7-b80c-c99653dbc6a0'::uuid, '8267a070-5459-4400-8031-8012587f74e4'::uuid), -- Megan wright     +
     ('231132e3-284e-4149-acbc-ebfe7a960eb1'::uuid, '151a90bd-32da-4ac5-8545-9cd6ba99edba'::uuid)  -- Yolanda McAfee   +
   LOOP                                                                                                                +
     -- Count and transfer bids                                                                                        +
     SELECT COUNT(*) INTO bid_count FROM bids WHERE person_id = person_mapping.column1;                                +
     UPDATE bids SET person_id = person_mapping.column2 WHERE person_id = person_mapping.column1;                      +
                                                                                                                       +
     -- Count and transfer votes                                                                                       +
     SELECT COUNT(*) INTO vote_count FROM votes WHERE person_id = person_mapping.column1;                              +
     UPDATE votes SET person_id = person_mapping.column2 WHERE person_id = person_mapping.column1;                     +
                                                                                                                       +
     -- Return results                                                                                                 +
     old_person_id := person_mapping.column1;                                                                          +
     new_person_id := person_mapping.column2;                                                                          +
     bids_moved := bid_count;                                                                                          +
     votes_moved := vote_count;                                                                                        +
     RETURN NEXT;                                                                                                      +
   END LOOP;                                                                                                           +
                                                                                                                       +
   RETURN;                                                                                                             +
 END;                                                                                                                  +
 $function$                                                                                                            +
 
(1 row)

