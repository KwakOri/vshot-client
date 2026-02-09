-- films.id를 UUID에서 TEXT(nanoid 8자)로 변경
-- 기존 UUID 데이터도 TEXT로 자동 캐스팅됨

ALTER TABLE films ALTER COLUMN id SET DATA TYPE TEXT USING id::TEXT;
ALTER TABLE films ALTER COLUMN id DROP DEFAULT;
