-- Permanent cleanup: remove archived legacy schema and all contained objects.
-- Irreversible.

begin;

drop schema if exists legacy_archive cascade;

commit;

