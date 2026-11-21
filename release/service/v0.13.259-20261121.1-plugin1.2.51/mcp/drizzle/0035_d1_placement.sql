-- Singleton, content-free provider location. Production metric details stay NULL.
ALTER TABLE sb_maintenance_state ADD d1_placement_json TEXT
 CHECK(d1_placement_json IS NULL OR (length(d1_placement_json)<=192 AND json_valid(d1_placement_json)));
